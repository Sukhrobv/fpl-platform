# 🧭 ГЛАВА 5. AI-АССИСТЕНТ ДЛЯ FPL ANALYTICS PLATFORM

## 🎯 Цель главы

Сделать **умного чат-ассистента для FPL**, который:

- Принимает запросы на естественном языке (RU/EN).
- Сам решает, какие данные запросить через **tools** поверх БД/сервисов.
- Не придумывает цифры, а опирается только на данные из твоей платформы.
- Встраивается в текущий стек:
  - Next.js 14 (App Router, TypeScript)
  - PostgreSQL (Supabase/Neon)
  - Prisma
  - Vercel (frontend) + существующие сервисы

Это файл-роадмап **для человека и для antigravity**:

- где нужно — он делает код сам,
- где нужна твоя помощь — это явно помечено.

---

## 🔑 Легенда по ролям

| Метка            | Описание                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `🤖 antigravity` | Задачи, которые ассистент может делать полностью сам (писать/рефакторить код, тесты, доки). |
| `🧑 ты`          | Задачи, которые должен решить / подтвердить человек.                                        |
| `🤝 совместно`   | antigravity готовит черновик, ты ревьюишь и принимаешь решения.                             |

---

## 0. Предпосылки и ограничения

### 0.1. Что считаем уже существующим

- БД с:
  - `players` (700+ игроков, xG/xA/xPts, цена, форма, травмы, ownership если есть),
  - `fixtures` (календарь на 5+ туров),
  - `user_teams`, `transfers_history` (личные данные по командам).
- Базовый бэкенд (Next.js API routes), который уже умеет:
  - отдавать игроков и их статы,
  - отдавать календарь,
  - отдавать состав пользователя,
  - отдавать рекомендации трансферов (rule-based).

> ❗ Если чего-то нет — antigravity должен честно написать в процессе работы:
> "Здесь нет нужной сущности/таблицы, нужно доопределить схему/эндпоинт вручную"

---

## 1. Общая архитектура AI-ассистента

### 1.1. Компоненты

```
┌─────────────────────────────────────────────────────────────────┐
│                         ПОЛЬЗОВАТЕЛЬ                            │
│              Вопрос на естественном языке                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CHAT API (/api/chat)                          │
│                                                                 │
│  1. Принимает сообщение                                         │
│  2. Формирует контекст (system prompt + история)                │
│  3. Вызывает LLM с описанием tools                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM PROVIDER (Gemini/Groq)                   │
│                                                                 │
│  - Анализирует вопрос                                           │
│  - Решает, какие tools вызвать                                  │
│  - Возвращает tool_calls или финальный ответ                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FPL DOMAIN TOOLS                             │
│                                                                 │
│  - get_player_by_name(name)                                     │
│  - search_replacements(position, maxPrice, ...)                 │
│  - get_user_team(userId)                                        │
│  - analyze_user_team(userId)                                    │
│  - get_fixtures(playerIds, gameweeks)                           │
│  - compare_players(player1, player2)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL (Prisma)                          │
│                                                                 │
│  players, fixtures, predictions, user_squads, ...               │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2. Рекомендуемая структура проекта

```
lib/
├── llm/
│   ├── client.ts              # LLM-клиент (Gemini/Groq)
│   ├── config.ts              # Конфиги (лимиты, модели)
│   ├── prompts/
│   │   └── systemPrompt.ts    # System prompt ассистента
│   └── tools/
│       ├── fplTools.ts        # Реализация доменных функций
│       └── definitions.ts     # Описание tools для LLM
│
app/
├── api/
│   └── chat/
│       └── route.ts           # Chat API endpoint
└── chat/
    └── page.tsx               # UI чат-страницы

docs/
├── 05_llm_provider_decision.md    # Решение по провайдеру
└── 05_fpl_tools.md                # Документация tools
```

---

## 2. ФАЗА 1 — Выбор LLM-провайдера и базовый клиент

### 2.1. Решение по провайдеру `🧑 ты`

**Задача:** выбрать основной провайдер LLM.

| Провайдер       | Модель           | Function Calling     | Бесплатный лимит |
| --------------- | ---------------- | -------------------- | ---------------- |
| **Gemini**      | Gemini 2.0 Flash | ✅ Да                | 1,500 req/day    |
| **Groq**        | Llama 3.1 70B    | ✅ Да                | 14,400 req/day   |
| **Together AI** | Llama 3.1        | ✅ Да                | $25 кредитов     |
| **OpenRouter**  | Разные           | ✅ Зависит от модели | Pay-per-use      |

**Твои действия:**

1. Выбрать провайдера и модель.
2. Создать файл `docs/05_llm_provider_decision.md` с кратким обоснованием.
3. Добавить в `.env`:
   ```env
   LLM_PROVIDER=gemini  # или groq
   LLM_MODEL=gemini-2.0-flash-exp
   LLM_API_KEY=your_api_key
   ```

---

### 2.2. Базовый LLM-клиент `🤖 antigravity`

**Цель:** создать единый слой `callLlm`, который:

- скрывает детали конкретного API;
- принимает messages + tools;
- возвращает текст ассистента и список tool-calls.

**Файл:** `lib/llm/client.ts`

```typescript
// lib/llm/client.ts

export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "tool"; name: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmCallOptions {
  model?: string;
  tools?: LlmToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "tool"; name: string };
  temperature?: number;
}

export interface LlmCallResult {
  message: string | null;
  toolCalls: LlmToolCall[];
}

export async function callLlm(
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  const provider = process.env.LLM_PROVIDER;

  if (provider === "gemini") {
    return callGemini(messages, options);
  } else if (provider === "groq") {
    return callGroq(messages, options);
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

async function callGemini(
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  // TODO: Implement Gemini API call
  throw new Error("Not implemented");
}

async function callGroq(
  messages: LlmMessage[],
  options: LlmCallOptions
): Promise<LlmCallResult> {
  // TODO: Implement Groq API call
  throw new Error("Not implemented");
}
```

**Конфиг:** `lib/llm/config.ts`

```typescript
export const LLM_CONFIG = {
  maxTokensPerCall: 2000,
  maxToolCallsPerRequest: 3,
  maxMessagesHistory: 15,
  defaultTemperature: 0.7,
};
```

---

## 3. ФАЗА 2 — FPL Domain Tools

### 3.1. Определение интерфейсов `🤝 совместно`

**Файл:** `lib/llm/tools/fplTools.ts`

```typescript
// lib/llm/tools/fplTools.ts

export type FplPosition = "GKP" | "DEF" | "MID" | "FWD";

export interface PlayerSummary {
  id: number;
  name: string;
  team: string;
  position: FplPosition;
  price: number;
  xPtsNext5: number;
  form: number;
  ownership?: number;
  isInjured: boolean;
  fixtures?: FixtureSummary[];
}

export interface FixtureSummary {
  gameweek: number;
  opponent: string;
  isHome: boolean;
  fdr: number;
}

export interface TeamAnalysis {
  healthScore: number;
  problems: string[];
  suggestions: string[];
  totalXPtsNext5: number;
}

// === ФУНКЦИИ ===

export async function getPlayerByName(
  name: string
): Promise<PlayerSummary | null> {
  // Поиск игрока по имени (fuzzy match)
  throw new Error("Not implemented");
}

export async function getPlayerById(id: number): Promise<PlayerSummary | null> {
  // Получить игрока по ID
  throw new Error("Not implemented");
}

export async function searchReplacements(params: {
  position?: FplPosition;
  maxPrice?: number;
  minXPts?: number;
  maxOwnership?: number;
  limit?: number;
}): Promise<PlayerSummary[]> {
  // Найти кандидатов на замену
  throw new Error("Not implemented");
}

export async function comparePlayers(
  player1Id: number,
  player2Id: number
): Promise<{ player1: PlayerSummary; player2: PlayerSummary }> {
  // Сравнить двух игроков
  throw new Error("Not implemented");
}

export async function getUserTeam(userId: string): Promise<PlayerSummary[]> {
  // Получить состав пользователя
  throw new Error("Not implemented");
}

export async function analyzeUserTeam(userId: string): Promise<TeamAnalysis> {
  // Анализ команды пользователя
  throw new Error("Not implemented");
}

export async function getFixturesForPlayers(
  playerIds: number[],
  gameweeks: number
): Promise<Record<number, FixtureSummary[]>> {
  // Календарь для игроков
  throw new Error("Not implemented");
}
```

---

### 3.2. Описание tools для LLM `🤖 antigravity`

**Файл:** `lib/llm/tools/definitions.ts`

```typescript
// lib/llm/tools/definitions.ts

import { z } from "zod";
import * as fplTools from "./fplTools";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute: (args: unknown) => Promise<unknown>;
}

export const tools: ToolDefinition[] = [
  {
    name: "get_player_by_name",
    description:
      "Получить данные игрока FPL по имени. Используй когда пользователь упоминает конкретного игрока.",
    inputSchema: z.object({
      name: z.string().describe("Имя игрока: Salah, Isak, Palmer и т.д."),
    }),
    execute: async (args) => {
      const { name } = args as { name: string };
      return fplTools.getPlayerByName(name);
    },
  },

  {
    name: "search_replacements",
    description:
      "Найти кандидатов на замену игрока. Используй когда пользователь ищет замену или спрашивает 'кого взять'.",
    inputSchema: z.object({
      position: z.enum(["GKP", "DEF", "MID", "FWD"]).optional(),
      maxPrice: z.number().optional().describe("Максимальная цена в миллионах"),
      minXPts: z.number().optional().describe("Минимальный xPts на 5 туров"),
      maxOwnership: z
        .number()
        .optional()
        .describe("Максимальный % владения (для дифференциалов)"),
      limit: z.number().optional().default(5),
    }),
    execute: async (args) => {
      return fplTools.searchReplacements(
        args as Parameters<typeof fplTools.searchReplacements>[0]
      );
    },
  },

  {
    name: "compare_players",
    description:
      "Сравнить двух игроков. Используй когда пользователь спрашивает 'X или Y', 'сравни X и Y'.",
    inputSchema: z.object({
      player1Name: z.string(),
      player2Name: z.string(),
    }),
    execute: async (args) => {
      const { player1Name, player2Name } = args as {
        player1Name: string;
        player2Name: string;
      };
      const p1 = await fplTools.getPlayerByName(player1Name);
      const p2 = await fplTools.getPlayerByName(player2Name);
      if (!p1 || !p2) return { error: "Один из игроков не найден" };
      return fplTools.comparePlayers(p1.id, p2.id);
    },
  },

  {
    name: "get_user_team",
    description: "Получить текущий состав команды пользователя в FPL.",
    inputSchema: z.object({
      userId: z.string().describe("FPL ID пользователя"),
    }),
    execute: async (args) => {
      const { userId } = args as { userId: string };
      return fplTools.getUserTeam(userId);
    },
  },

  {
    name: "analyze_user_team",
    description:
      "Проанализировать команду пользователя: найти проблемы, дать рекомендации.",
    inputSchema: z.object({
      userId: z.string().describe("FPL ID пользователя"),
    }),
    execute: async (args) => {
      const { userId } = args as { userId: string };
      return fplTools.analyzeUserTeam(userId);
    },
  },

  {
    name: "get_fixtures",
    description: "Получить календарь матчей для игроков на ближайшие N туров.",
    inputSchema: z.object({
      playerNames: z.array(z.string()).describe("Список имён игроков"),
      gameweeks: z.number().default(5).describe("Количество туров"),
    }),
    execute: async (args) => {
      const { playerNames, gameweeks } = args as {
        playerNames: string[];
        gameweeks: number;
      };
      const players = await Promise.all(
        playerNames.map((n) => fplTools.getPlayerByName(n))
      );
      const ids = players.filter(Boolean).map((p) => p!.id);
      return fplTools.getFixturesForPlayers(ids, gameweeks);
    },
  },
];

// Конвертация в формат для LLM
export function getToolDefinitionsForLlm() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: JSON.parse(JSON.stringify(t.inputSchema)), // zod to JSON schema
  }));
}

// Выполнение tool call
export async function executeTool(
  name: string,
  args: unknown
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args);
}
```

---

## 4. ФАЗА 3 — System Prompt

### 4.1. System Prompt ассистента `🤝 совместно`

**Файл:** `lib/llm/prompts/systemPrompt.ts`

```typescript
export const SYSTEM_PROMPT = `
Ты — аналитический ассистент по Fantasy Premier League (FPL) для закрытой платформы.

## Твои возможности
- Отвечать на вопросы об игроках, командах, календаре
- Сравнивать игроков
- Анализировать состав пользователя
- Рекомендовать трансферы и замены
- Искать дифференциалов

## Ограничения
- ❌ НЕ придумывай статистику. Все данные бери ТОЛЬКО из tools.
- ❌ Если данных нет — честно скажи об этом.
- ❌ Не давай финансовых советов.

## Метрики, которые ты знаешь
- **xPts** — прогноз очков на основе xG/xA
- **EO (Effective Ownership)** — % владения среди топ-менеджеров
- **FDR** — сложность календаря (1-5, где 1 — лёгкий)
- **Форма** — средние очки за последние 5 туров

## Как отвечать
1. Сначала вызови нужные tools чтобы получить данные
2. Проанализируй данные
3. Дай краткий, структурированный ответ
4. Если сравниваешь игроков — используй таблицу

## Примеры вопросов и стратегия
- "Кого взять вместо Исака?" → get_player_by_name(Isak) + search_replacements
- "Сравни Салаха и Сака" → compare_players
- "Разбери мою команду" → get_user_team + analyze_user_team
- "Топ дифференциалы" → search_replacements(maxOwnership: 10)

Отвечай на русском или английском — в зависимости от языка вопроса.
`.trim();
```

---

## 5. ФАЗА 4 — Chat API

### 5.1. Chat API endpoint `🤖 antigravity`

**Файл:** `app/api/chat/route.ts`

```typescript
// app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";
import { callLlm, LlmMessage } from "@/lib/llm/client";
import { SYSTEM_PROMPT } from "@/lib/llm/prompts/systemPrompt";
import {
  getToolDefinitionsForLlm,
  executeTool,
} from "@/lib/llm/tools/definitions";
import { LLM_CONFIG } from "@/lib/llm/config";

export async function POST(req: NextRequest) {
  try {
    const { messages, userId } = await req.json();

    // Формируем контекст
    const llmMessages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-LLM_CONFIG.maxMessagesHistory),
    ];

    // Первый вызов LLM — может вернуть tool calls
    let result = await callLlm(llmMessages, {
      tools: getToolDefinitionsForLlm(),
      toolChoice: "auto",
    });

    // Обработка tool calls (максимум N итераций)
    let iterations = 0;
    while (
      result.toolCalls.length > 0 &&
      iterations < LLM_CONFIG.maxToolCallsPerRequest
    ) {
      iterations++;

      // Выполняем все tool calls
      for (const toolCall of result.toolCalls) {
        const toolResult = await executeTool(toolCall.name, toolCall.arguments);
        llmMessages.push({
          role: "tool",
          name: toolCall.name,
          content: JSON.stringify(toolResult),
        });
      }

      // Снова вызываем LLM для финального ответа
      result = await callLlm(llmMessages, {
        tools: getToolDefinitionsForLlm(),
        toolChoice: "auto",
      });
    }

    return NextResponse.json({
      message: result.message,
      toolsUsed: iterations > 0,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## 6. ФАЗА 5 — Frontend чат

### 6.1. Страница чата `🤖 antigravity`

**Файл:** `app/chat/page.tsx`

Создать страницу с:

- Полем ввода сообщения
- Историей диалога (user vs assistant)
- Индикатором загрузки
- Отображением структурированных данных (таблицы игроков)

---

## 7. ФАЗА 6 — Тестирование сценариев

### 7.1. Ключевые сценарии `🤝 совместно`

| Сценарий       | Пример вопроса                                   | Ожидаемые tools                         |
| -------------- | ------------------------------------------------ | --------------------------------------- |
| Замена игрока  | "Кого взять вместо травмированного Исака до 9м?" | get_player_by_name, search_replacements |
| Сравнение      | "Сравни Салаха и Сака на 5 туров"                | compare_players, get_fixtures           |
| Анализ команды | "Разбери мою команду"                            | get_user_team, analyze_user_team        |
| Дифференциалы  | "Топ дифференциалы среди форвардов"              | search_replacements(maxOwnership: 10)   |

---

## 8. Определение "ГОТОВО"

Глава 5 считается завершённой, если:

- ✅ Настроен LLM-провайдер и базовый клиент (`lib/llm/client.ts`)
- ✅ Реализованы доменные FPL tools (`fplTools.ts`) и описаны для LLM (`definitions.ts`)
- ✅ Есть SYSTEM_PROMPT с описанием роли и ограничений
- ✅ Работает endpoint `/api/chat` с поддержкой function calling
- ✅ Есть страница `/chat` с UI
- ✅ Три ключевых сценария дают вменяемый результат
- ✅ Есть документация: `docs/05_llm_provider_decision.md`, `docs/05_fpl_tools.md`

---

## 9. Чеклист реализации

- [ ] **ФАЗА 1:** Выбор провайдера + базовый клиент
- [ ] **ФАЗА 2:** FPL Domain Tools (интерфейсы + реализация)
- [ ] **ФАЗА 3:** System Prompt
- [ ] **ФАЗА 4:** Chat API endpoint
- [ ] **ФАЗА 5:** Frontend чат
- [ ] **ФАЗА 6:** Тестирование сценариев
