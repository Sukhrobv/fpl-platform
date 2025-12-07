# FPL Domain Tools — Документация

## Обзор

Доменные функции для работы с FPL данными через LLM. Позволяют AI-ассистенту получать реальные данные из базы.

## Доступные Tools

### 1. `get_player_by_name`

**Описание**: Получить информацию об игроке по имени (fuzzy search).

**Параметры**:
| Параметр | Тип | Описание |
|----------|-----|----------|
| `name` | string | Имя игрока (Salah, Isak, Palmer) |

**Возвращает**:

```json
{
  "id": 308,
  "name": "Mohamed Salah",
  "webName": "Salah",
  "team": "LIV",
  "position": "MID",
  "price": 13.5,
  "xPtsNext5": 42.5,
  "form": 8.5,
  "ownership": 67.2,
  "isInjured": false,
  "fixtures": [...]
}
```

---

### 2. `search_replacements`

**Описание**: Найти кандидатов на замену по критериям.

**Параметры**:
| Параметр | Тип | Описание |
|----------|-----|----------|
| `position` | GKP/DEF/MID/FWD | Позиция (опционально) |
| `maxPrice` | number | Макс. цена в миллионах |
| `maxOwnership` | number | Макс. % владения (дифференциалы) |
| `limit` | number | Количество результатов (по умолчанию 5) |

**Пример использования**:

- "Форварды до 8м" → `{position: "FWD", maxPrice: 8}`
- "Дифференциалы" → `{maxOwnership: 10}`

---

### 3. `compare_players`

**Описание**: Сравнить двух игроков по ключевым метрикам.

**Параметры**:
| Параметр | Тип | Описание |
|----------|-----|----------|
| `player1Name` | string | Имя первого игрока |
| `player2Name` | string | Имя второго игрока |

**Возвращает**:

- Данные обоих игроков
- Таблицу сравнения по 5 метрикам
- Рекомендацию кого выбрать

---

### 4. `get_fixtures`

**Описание**: Получить календарь матчей для игроков.

**Параметры**:
| Параметр | Тип | Описание |
|----------|-----|----------|
| `playerNames` | string[] | Список имён игроков |
| `gameweeks` | number | Количество туров (по умолчанию 5) |

**Возвращает**:

```json
{
  "Salah": [
    { "gameweek": 15, "opponent": "WHU", "isHome": true, "fdr": 2 },
    { "gameweek": 16, "opponent": "NEW", "isHome": false, "fdr": 3 }
  ]
}
```

---

## Архитектура файлов

```
lib/llm/
├── client.ts           # LLM клиент (Groq/Gemini)
├── config.ts           # Конфигурация
├── prompts/
│   └── systemPrompt.ts # System prompt
└── tools/
    ├── fplTools.ts     # Реализация функций
    └── definitions.ts  # Описания для LLM
```

## Добавление нового tool

1. Реализовать функцию в `fplTools.ts`
2. Добавить JSON Schema и execute в `definitions.ts`
3. Обновить system prompt при необходимости
