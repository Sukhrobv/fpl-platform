// lib/llm/tools/fplTools.ts
// Доменные функции для работы с FPL данными

import { prisma } from "@/lib/db";
import { Position, Prisma } from "@prisma/client";

// ==========================================
// TYPES
// ==========================================

export type FplPosition = "GKP" | "DEF" | "MID" | "FWD";

const POSITION_MAP: Record<FplPosition, Position> = {
  GKP: "GOALKEEPER",
  DEF: "DEFENDER",
  MID: "MIDFIELDER",
  FWD: "FORWARD",
};

export interface PlayerSummary {
  id: number;
  name: string;
  webName: string;
  team: string;
  position: FplPosition;
  price: number;
  xPtsNext5: number;
  form: number;
  ownership: number;
  isInjured: boolean;
  injuryStatus?: string;
  fixtures?: FixtureSummary[];
}

export interface FixtureSummary {
  gameweek: number;
  opponent: string;
  isHome: boolean;
  fdr: number;
}

export interface ComparisonResult {
  player1: PlayerSummary;
  player2: PlayerSummary;
  comparison: {
    metric: string;
    player1Value: string | number;
    player2Value: string | number;
    winner: 1 | 2 | 0;
  }[];
  recommendation: string;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function positionToFpl(position: Position): FplPosition {
  const reverseMap: Record<Position, FplPosition> = {
    GOALKEEPER: "GKP",
    DEFENDER: "DEF",
    MIDFIELDER: "MID",
    FORWARD: "FWD",
  };
  return reverseMap[position];
}

function normalizeSearchName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function getPlayerXPts(playerId: number, form: number): Promise<number> {
  // Примерный расчёт на основе формы
  const baseXPts = form || 4;
  return Math.round(baseXPts * 5 * 10) / 10;
}

// Тип для результата Prisma запроса игрока
type PlayerWithTeam = Prisma.PlayerGetPayload<{ include: { team: true } }>;

async function mapPlayerToSummary(
  player: PlayerWithTeam,
  includeFixtures = false
): Promise<PlayerSummary> {
  const xPtsNext5 = await getPlayerXPts(player.id, player.form);

  let fixtures: FixtureSummary[] | undefined;
  if (includeFixtures && player.team) {
    fixtures = await getPlayerFixtures(player.teamId, 5);
  }

  return {
    id: player.id,
    name: `${player.firstName || ""} ${player.secondName || ""}`.trim(),
    webName: player.webName,
    team: player.team?.shortName || "Unknown",
    position: positionToFpl(player.position),
    price: player.nowCost / 10,
    xPtsNext5,
    form: player.form || 0,
    ownership: player.selectedBy || 0,
    isInjured: player.chanceOfPlaying !== null && player.chanceOfPlaying < 100,
    injuryStatus: player.news || undefined,
    fixtures,
  };
}

async function getPlayerFixtures(
  teamId: number,
  gameweeks: number
): Promise<FixtureSummary[]> {
  // Получаем текущий gameweek из последнего матча
  const lastMatch = await prisma.match.findFirst({
    where: { finished: true },
    orderBy: { gameweek: "desc" },
    select: { gameweek: true },
  });

  const currentGw = lastMatch?.gameweek || 1;

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      gameweek: { gte: currentGw, lte: currentGw + gameweeks - 1 },
    },
    include: {
      homeTeam: { select: { shortName: true } },
      awayTeam: { select: { shortName: true } },
    },
    orderBy: { gameweek: "asc" },
    take: gameweeks,
  });

  return matches.map((m) => {
    const isHome = m.homeTeamId === teamId;
    const opponent = isHome ? m.awayTeam?.shortName : m.homeTeam?.shortName;

    // FDR based on opponent strength (simplified)
    const fdr = 3; // Default medium difficulty

    return {
      gameweek: m.gameweek,
      opponent: opponent || "TBD",
      isHome,
      fdr,
    };
  });
}

// ==========================================
// TOOL FUNCTIONS
// ==========================================

/**
 * Поиск игрока по имени (fuzzy match)
 */
export async function getPlayerByName(
  name: string
): Promise<PlayerSummary | null> {
  const normalizedSearch = normalizeSearchName(name);

  // Сначала точный поиск по webName
  let player = await prisma.player.findFirst({
    where: {
      webName: { contains: name, mode: "insensitive" },
    },
    include: { team: true },
  });

  // Если не нашли - ищем по secondName
  if (!player) {
    player = await prisma.player.findFirst({
      where: {
        secondName: { contains: name, mode: "insensitive" },
      },
      include: { team: true },
    });
  }

  // Если всё ещё не нашли - fuzzy search
  if (!player) {
    const allPlayers = await prisma.player.findMany({
      include: { team: true },
    });

    const matched = allPlayers.find((p) => {
      const normalized = normalizeSearchName(p.webName);
      return (
        normalized.includes(normalizedSearch) ||
        normalizedSearch.includes(normalized)
      );
    });

    player = matched ?? null;
  }

  if (!player) return null;

  return mapPlayerToSummary(player, true);
}

/**
 * Поиск кандидатов на замену
 */
export async function searchReplacements(params: {
  position?: FplPosition;
  maxPrice?: number;
  minXPts?: number;
  maxOwnership?: number;
  limit?: number;
}): Promise<PlayerSummary[]> {
  const { position, maxPrice, maxOwnership, limit = 5 } = params;

  const where: Prisma.PlayerWhereInput = {};

  if (position) {
    where.position = POSITION_MAP[position];
  }

  if (maxPrice) {
    where.nowCost = { lte: maxPrice * 10 };
  }

  if (maxOwnership) {
    where.selectedBy = { lt: maxOwnership };
  }

  // Исключаем травмированных
  where.OR = [
    { chanceOfPlaying: null },
    { chanceOfPlaying: { gte: 75 } },
  ];

  const players = await prisma.player.findMany({
    where,
    include: { team: true },
    orderBy: { form: "desc" },
    take: limit * 2,
  });

  const summaries = await Promise.all(
    players.map((p) => mapPlayerToSummary(p, true))
  );

  // Сортируем по xPts
  return summaries.sort((a, b) => b.xPtsNext5 - a.xPtsNext5).slice(0, limit);
}

/**
 * Сравнение двух игроков
 */
export async function comparePlayers(
  player1Id: number,
  player2Id: number
): Promise<ComparisonResult | null> {
  const [p1, p2] = await Promise.all([
    prisma.player.findUnique({
      where: { id: player1Id },
      include: { team: true },
    }),
    prisma.player.findUnique({
      where: { id: player2Id },
      include: { team: true },
    }),
  ]);

  if (!p1 || !p2) return null;

  const [summary1, summary2] = await Promise.all([
    mapPlayerToSummary(p1, true),
    mapPlayerToSummary(p2, true),
  ]);

  const comparison: ComparisonResult["comparison"] = [
    {
      metric: "Цена",
      player1Value: `${summary1.price}m`,
      player2Value: `${summary2.price}m`,
      winner:
        summary1.price < summary2.price
          ? 1
          : summary2.price < summary1.price
            ? 2
            : 0,
    },
    {
      metric: "xPts (5 туров)",
      player1Value: summary1.xPtsNext5,
      player2Value: summary2.xPtsNext5,
      winner:
        summary1.xPtsNext5 > summary2.xPtsNext5
          ? 1
          : summary2.xPtsNext5 > summary1.xPtsNext5
            ? 2
            : 0,
    },
    {
      metric: "Форма",
      player1Value: summary1.form,
      player2Value: summary2.form,
      winner:
        summary1.form > summary2.form
          ? 1
          : summary2.form > summary1.form
            ? 2
            : 0,
    },
    {
      metric: "Владение",
      player1Value: `${summary1.ownership}%`,
      player2Value: `${summary2.ownership}%`,
      winner: 0,
    },
    {
      metric: "Здоровье",
      player1Value: summary1.isInjured ? "⚠️ Сомнителен" : "✅ Fit",
      player2Value: summary2.isInjured ? "⚠️ Сомнителен" : "✅ Fit",
      winner:
        !summary1.isInjured && summary2.isInjured
          ? 1
          : !summary2.isInjured && summary1.isInjured
            ? 2
            : 0,
    },
  ];

  const p1Wins = comparison.filter((c) => c.winner === 1).length;
  const p2Wins = comparison.filter((c) => c.winner === 2).length;

  let recommendation: string;
  if (p1Wins > p2Wins) {
    recommendation = `${summary1.webName} выглядит лучше по ${p1Wins} из ${comparison.length} метрикам.`;
  } else if (p2Wins > p1Wins) {
    recommendation = `${summary2.webName} выглядит лучше по ${p2Wins} из ${comparison.length} метрикам.`;
  } else {
    recommendation =
      "Оба игрока примерно равны. Выбор зависит от вашей стратегии.";
  }

  return {
    player1: summary1,
    player2: summary2,
    comparison,
    recommendation,
  };
}

/**
 * Получить календарь для нескольких игроков
 */
export async function getFixturesForPlayers(
  playerIds: number[],
  gameweeks: number = 5
): Promise<Record<number, FixtureSummary[]>> {
  const result: Record<number, FixtureSummary[]> = {};

  // Получаем teamId для каждого игрока
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, teamId: true },
  });

  for (const player of players) {
    result[player.id] = await getPlayerFixtures(player.teamId, gameweeks);
  }

  return result;
}
