import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Gw1PreseasonProjection } from "@/lib/services/seasonPredictionPublicationService";
import {
  ROLLING_PREDICTION_DATASET,
  type RollingPredictionPayload,
} from "@/lib/services/rollingPredictionService";

const DEFAULT_SEASON = "2026/27";

interface PreseasonPreviewPayload {
  targetSeason: string;
  gameweek: 1;
  methodology: string;
  projections: Gw1PreseasonProjection[];
}

/**
 * Player Explorer deliberately reads the season-scoped, frozen GW1 preview.
 * The prior global engine is not a valid source for 2026/27: it mixes the new
 * fixture list with legacy player/team rows and silently substitutes missing
 * opponent data. Returning one transparent GW1 estimate is safer than
 * presenting five fabricated identical projections.
 */
export async function GET(request: Request) {
  const seasonCode =
    new URL(request.url).searchParams.get("season") ?? DEFAULT_SEASON;
  if (!/^\d{4}\/\d{2}$/.test(seasonCode)) {
    return NextResponse.json({ error: "Invalid season code" }, { status: 400 });
  }

  try {
    const season = await prisma.season.findUnique({
      where: { code: seasonCode },
      select: { id: true, code: true },
    });
    if (!season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    const rollingSnapshot = await prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: season.id,
        source: "internal",
        dataset: ROLLING_PREDICTION_DATASET,
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true, fetchedAt: true, payload: true },
    });
    if (rollingSnapshot) {
      const rolling =
        rollingSnapshot.payload as unknown as RollingPredictionPayload;
      if (rolling.targetSeason !== season.code) {
        throw new Error(
          "Rolling prediction snapshot belongs to another season",
        );
      }
      return NextResponse.json(
        {
          season: season.code,
          gameweeks: rolling.horizonGameweeks,
          source: "ROLLING_NEXT_5",
          status: "PREVIEW_ONLY",
          methodology: rolling.methodology,
          snapshot: {
            id: rollingSnapshot.id,
            fetchedAt: rollingSnapshot.fetchedAt,
          },
          predictions: rolling.projections.map((projection) => {
            const fixturesByGameweek = new Map<
              number,
              typeof projection.fixtures
            >();
            for (const fixture of projection.fixtures) {
              const current = fixturesByGameweek.get(fixture.gameweek) ?? [];
              current.push(fixture);
              fixturesByGameweek.set(fixture.gameweek, current);
            }
            const history = Object.fromEntries(
              [...fixturesByGameweek.entries()].map(([gameweek, fixtures]) => {
                const first = fixtures[0];
                const xPts = fixtures.reduce(
                  (sum, fixture) => sum + fixture.xPts,
                  0,
                );
                const range = {
                  lower: Number(
                    fixtures
                      .reduce((sum, fixture) => sum + fixture.range.lower, 0)
                      .toFixed(2),
                  ),
                  upper: Number(
                    fixtures
                      .reduce((sum, fixture) => sum + fixture.range.upper, 0)
                      .toFixed(2),
                  ),
                  label: "INDICATIVE" as const,
                };
                const sumBreakdown = (key: keyof typeof first.breakdown) =>
                  Number(
                    fixtures
                      .reduce((sum, fixture) => sum + fixture.breakdown[key], 0)
                      .toFixed(2),
                  );
                return [
                  gameweek,
                  {
                    xPts: Number(xPts.toFixed(2)),
                    fixture: fixtures
                      .map(
                        (fixture) =>
                          `${fixture.opponent} ${fixture.isHome ? "(H)" : "(A)"}`,
                      )
                      .join(" + "),
                    opponent: fixtures
                      .map((fixture) => fixture.opponent)
                      .join(", "),
                    isHome: fixtures.every((fixture) => fixture.isHome),
                    range,
                    breakdown: {
                      appearance: sumBreakdown("appearance"),
                      attack: sumBreakdown("attacking"),
                      defense: sumBreakdown("defense"),
                      cleanSheet: sumBreakdown("cleanSheet"),
                      goalsConcededPenalty: sumBreakdown(
                        "goalsConcededPenalty",
                      ),
                      defcon: sumBreakdown("defcon"),
                      saves: sumBreakdown("saves"),
                      bonus: sumBreakdown("bonus"),
                    },
                    raw: {
                      pStart: first.startProbability,
                      p60: projection.confidenceScore * first.startProbability,
                      eMin: Number(
                        fixtures
                          .reduce(
                            (sum, fixture) => sum + fixture.expectedMinutes,
                            0,
                          )
                          .toFixed(1),
                      ),
                    },
                    context: {
                      player: {
                        xG90_recent: projection.evidence.xG90,
                        xA90_recent: projection.evidence.xA90,
                        touches90: projection.evidence.touches90,
                        keyPasses90: projection.evidence.keyPasses90,
                        carries90: projection.evidence.carries90,
                        defconActions90: projection.evidence.defconActions90,
                        clearances90: projection.evidence.clearances90,
                        h2h: first.h2h,
                        attackRate: first.attackRate,
                      },
                      opponent: {
                        strengthSource: first.opponentStrength.source,
                        historicalDefenseMultiplier:
                          first.opponentStrength
                            .defensiveVulnerabilityMultiplier,
                        historicalSourceSeason:
                          first.opponentStrength.sourceSeason,
                        historicalMatches: first.opponentStrength.sourceMatches,
                        teamStrengthSource: first.teamStrength.source,
                        teamAttackMultiplier:
                          first.teamStrength.attackMultiplier,
                        teamDefensiveVulnerabilityMultiplier:
                          first.teamStrength.defensiveVulnerabilityMultiplier,
                      },
                      reliability: { score: projection.confidenceScore * 100 },
                      manualOverride: first.manualOverride,
                      preseasonMinutesEvidence: first.preseasonMinutesEvidence,
                      limitations: projection.limitations,
                      methodology: rolling.methodology,
                    },
                  },
                ];
              }),
            );
            return {
              playerId: projection.seasonPlayerId,
              totalXPts: projection.totalXPts,
              totalRange: projection.totalRange,
              fixtures: Object.fromEntries(
                [...fixturesByGameweek.entries()].map(
                  ([gameweek, fixtures]) => [
                    gameweek,
                    {
                      fixture: fixtures
                        .map(
                          (fixture) =>
                            `${fixture.opponent} (${fixture.isHome ? "H" : "A"})`,
                        )
                        .join(" + "),
                      opponent: fixtures
                        .map((fixture) => fixture.opponent)
                        .join(", "),
                      isHome: fixtures.every((fixture) => fixture.isHome),
                    },
                  ],
                ),
              ),
              history,
            };
          }),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const snapshot = await prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: season.id,
        source: "internal",
        dataset: "gw1-preseason-projection-preview",
        valid: true,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true, fetchedAt: true, payload: true },
    });
    if (!snapshot) {
      return NextResponse.json({
        season: season.code,
        gameweeks: [],
        predictions: [],
        source: "GW1_PRESEASON_PREVIEW",
        status: "NOT_READY",
      });
    }

    const preview = snapshot.payload as unknown as PreseasonPreviewPayload;
    if (preview.targetSeason !== season.code || preview.gameweek !== 1) {
      throw new Error(
        "GW1 preview snapshot does not match the requested season",
      );
    }

    const nextGameweekRows = await prisma.match.findMany({
      where: { seasonId: season.id, finished: false },
      orderBy: { gameweek: "asc" },
      select: { gameweek: true },
      distinct: ["gameweek"],
      take: 5,
    });
    const horizonGameweeks = nextGameweekRows.map((row) => row.gameweek);
    const [registrations, fixtures] = await Promise.all([
      prisma.seasonPlayer.findMany({
        where: { seasonId: season.id, active: true },
        select: { id: true, seasonTeamId: true },
      }),
      prisma.match.findMany({
        where: { seasonId: season.id, gameweek: { in: horizonGameweeks } },
        select: {
          gameweek: true,
          homeSeasonTeamId: true,
          awaySeasonTeamId: true,
          homeSeasonTeam: { select: { shortName: true } },
          awaySeasonTeam: { select: { shortName: true } },
        },
      }),
    ]);
    const teamFixturePlan = new Map<
      number,
      Record<number, { fixture: string; opponent: string; isHome: boolean }>
    >();
    for (const fixture of fixtures) {
      const homePlan = teamFixturePlan.get(fixture.homeSeasonTeamId) ?? {};
      homePlan[fixture.gameweek] = {
        fixture: `${fixture.awaySeasonTeam.shortName} (H)`,
        opponent: fixture.awaySeasonTeam.shortName,
        isHome: true,
      };
      teamFixturePlan.set(fixture.homeSeasonTeamId, homePlan);

      const awayPlan = teamFixturePlan.get(fixture.awaySeasonTeamId) ?? {};
      awayPlan[fixture.gameweek] = {
        fixture: `${fixture.homeSeasonTeam.shortName} (A)`,
        opponent: fixture.homeSeasonTeam.shortName,
        isHome: false,
      };
      teamFixturePlan.set(fixture.awaySeasonTeamId, awayPlan);
    }
    const teamIdBySeasonPlayerId = new Map(
      registrations.map((registration) => [
        registration.id,
        registration.seasonTeamId,
      ]),
    );

    return NextResponse.json(
      {
        season: season.code,
        gameweeks: horizonGameweeks,
        source: "GW1_PRESEASON_PREVIEW",
        status: "PREVIEW_ONLY",
        methodology: preview.methodology,
        snapshot: { id: snapshot.id, fetchedAt: snapshot.fetchedAt },
        predictions: preview.projections.map((projection) => {
          const fixture = projection.fixtures[0];
          const fixturePlan =
            teamFixturePlan.get(
              teamIdBySeasonPlayerId.get(projection.seasonPlayerId) ?? -1,
            ) ?? {};
          return {
            playerId: projection.seasonPlayerId,
            totalXPts: projection.totalXPts,
            totalRange: projection.totalRange,
            fixtures: fixturePlan,
            history: fixture
              ? {
                  1: {
                    xPts: fixture.xPts,
                    fixture: `${fixture.opponent} ${fixture.isHome ? "(H)" : "(A)"}`,
                    opponent: fixture.opponent,
                    isHome: fixture.isHome,
                    range: fixture.range,
                    breakdown: {
                      appearance: fixture.breakdown.appearance,
                      attack: fixture.breakdown.attacking,
                      defense: fixture.breakdown.defense,
                      cleanSheet: fixture.breakdown.cleanSheet,
                      goalsConcededPenalty:
                        fixture.breakdown.goalsConcededPenalty,
                      defcon: fixture.breakdown.defcon,
                      saves: fixture.breakdown.saves,
                      bonus: 0,
                    },
                    raw: {
                      pStart: fixture.startProbability,
                      p60: projection.reliability.sixtyMinuteProbability,
                      eMin: fixture.expectedMinutes,
                    },
                    context: {
                      player: {
                        xG90_recent: projection.evidence.xG90,
                        xA90_recent: projection.evidence.xA90,
                        touches90: projection.evidence.touches90,
                        keyPasses90: projection.evidence.keyPasses90,
                        carries90: projection.evidence.carries90,
                        defconActions90: projection.evidence.defconActions90,
                        clearances90: projection.evidence.clearances90,
                      },
                      opponent: {
                        strengthSource: fixture.opponentStrength.source,
                        historicalDefenseMultiplier:
                          fixture.opponentStrength
                            .defensiveVulnerabilityMultiplier,
                        historicalSourceSeason:
                          fixture.opponentStrength.sourceSeason,
                        historicalMatches:
                          fixture.opponentStrength.sourceMatches,
                        teamStrengthSource: fixture.teamStrength.source,
                        teamAttackMultiplier:
                          fixture.teamStrength.attackMultiplier,
                        teamDefensiveVulnerabilityMultiplier:
                          fixture.teamStrength.defensiveVulnerabilityMultiplier,
                      },
                      reliability: projection.reliability,
                      manualOverride: fixture.manualOverride,
                      preseasonMinutesEvidence:
                        fixture.preseasonMinutesEvidence,
                      limitations: projection.limitations,
                      methodology: preview.methodology,
                    },
                  },
                }
              : {},
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error loading season-scoped predictions:", error);
    return NextResponse.json(
      { error: "Failed to load season-scoped predictions" },
      { status: 500 },
    );
  }
}
