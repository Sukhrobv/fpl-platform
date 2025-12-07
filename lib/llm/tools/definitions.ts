// lib/llm/tools/definitions.ts
// Описания tools для LLM

import {
  getPlayerByName,
  searchReplacements,
  comparePlayers,
  getFixturesForPlayers,
  FplPosition,
} from "./fplTools";

// ==========================================
// TYPES
// ==========================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ==========================================
// JSON SCHEMAS (pre-defined, no Zod conversion needed)
// ==========================================

const getPlayerByNameSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Имя игрока: Salah, Isak, Palmer, Haaland и т.д.",
    },
  },
  required: ["name"],
};

const searchReplacementsSchema = {
  type: "object",
  properties: {
    position: {
      type: "string",
      enum: ["GKP", "DEF", "MID", "FWD"],
      description:
        "Позиция: GKP (вратарь), DEF (защитник), MID (полузащитник), FWD (нападающий)",
    },
    maxPrice: {
      type: "number",
      description: "Максимальная цена в миллионах (например, 8.5)",
    },
    minXPts: {
      type: "number",
      description: "Минимальный прогноз xPts на 5 туров",
    },
    maxOwnership: {
      type: "number",
      description: "Максимальный % владения (для поиска дифференциалов)",
    },
    limit: {
      type: "number",
      description: "Количество результатов (по умолчанию 5)",
      default: 5,
    },
  },
  required: [],
};

const comparePlayersSchema = {
  type: "object",
  properties: {
    player1Name: {
      type: "string",
      description: "Имя первого игрока",
    },
    player2Name: {
      type: "string",
      description: "Имя второго игрока",
    },
  },
  required: ["player1Name", "player2Name"],
};

const getFixturesSchema = {
  type: "object",
  properties: {
    playerNames: {
      type: "array",
      items: { type: "string" },
      description: "Список имён игроков",
    },
    gameweeks: {
      type: "number",
      description: "Количество туров для анализа (по умолчанию 5)",
      default: 5,
    },
  },
  required: ["playerNames"],
};

// ==========================================
// TOOL DEFINITIONS
// ==========================================

export const tools: ToolDefinition[] = [
  {
    name: "get_player_by_name",
    description:
      "Получить подробную информацию об игроке FPL по имени. Используй когда пользователь спрашивает о конкретном игроке, его статистике, форме или календаре.",
    parameters: getPlayerByNameSchema,
    execute: async (args) => {
      const name = args.name as string;
      if (!name) {
        return { error: "Имя игрока не указано" };
      }
      const result = await getPlayerByName(name);
      if (!result) {
        return { error: `Игрок "${name}" не найден` };
      }
      return result;
    },
  },

  {
    name: "search_replacements",
    description:
      "Найти кандидатов на замену игрока или подобрать игроков по критериям. Используй когда пользователь ищет замену, спрашивает 'кого взять', или ищет дифференциалов.",
    parameters: searchReplacementsSchema,
    execute: async (args) => {
      return searchReplacements({
        position: args.position as FplPosition | undefined,
        maxPrice: args.maxPrice as number | undefined,
        minXPts: args.minXPts as number | undefined,
        maxOwnership: args.maxOwnership as number | undefined,
        limit: (args.limit as number) || 5,
      });
    },
  },

  {
    name: "compare_players",
    description:
      "Сравнить двух игроков по ключевым метрикам. Используй когда пользователь спрашивает 'X или Y', 'сравни X и Y', или выбирает между игроками.",
    parameters: comparePlayersSchema,
    execute: async (args) => {
      const player1Name = args.player1Name as string;
      const player2Name = args.player2Name as string;

      if (!player1Name || !player2Name) {
        return { error: "Нужно указать имена обоих игроков" };
      }

      const [p1, p2] = await Promise.all([
        getPlayerByName(player1Name),
        getPlayerByName(player2Name),
      ]);

      if (!p1) return { error: `Игрок "${player1Name}" не найден` };
      if (!p2) return { error: `Игрок "${player2Name}" не найден` };

      return comparePlayers(p1.id, p2.id);
    },
  },

  {
    name: "get_fixtures",
    description:
      "Получить календарь матчей для игроков на ближайшие туры. Показывает соперников, домашние/гостевые матчи и сложность (FDR).",
    parameters: getFixturesSchema,
    execute: async (args) => {
      const playerNames = args.playerNames as string[];
      const gameweeks = (args.gameweeks as number) || 5;

      if (!playerNames || playerNames.length === 0) {
        return { error: "Нужно указать имена игроков" };
      }

      const players = await Promise.all(
        playerNames.map((n) => getPlayerByName(n))
      );

      const validPlayers = players.filter(Boolean) as NonNullable<
        (typeof players)[number]
      >[];

      if (validPlayers.length === 0) {
        return { error: "Ни один игрок не найден" };
      }

      const ids = validPlayers.map((p) => p.id);
      const fixtures = await getFixturesForPlayers(ids, gameweeks);

      // Возвращаем с именами игроков для удобства
      const result: Record<string, unknown> = {};
      for (const player of validPlayers) {
        result[player.webName] = fixtures[player.id];
      }
      return result;
    },
  },
];

// ==========================================
// EXPORTS
// ==========================================

/**
 * Получить описания tools для LLM
 */
export function getToolDefinitionsForLlm() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Выполнить tool по имени
 */
export async function executeTool(
  name: string,
  args: unknown
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    return await tool.execute(args as Record<string, unknown>);
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return {
      error: `Ошибка выполнения: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
