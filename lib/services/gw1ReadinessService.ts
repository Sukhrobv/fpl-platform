import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type PriorConfidence,
} from "@prisma/client";
import {
  DEFAULT_PRIOR_VERSION,
  applyUncertaintyFlags,
} from "@/lib/services/playerSeasonPriorService";

export interface Gw1ReadinessCoverage {
  teams: number;
  players: number;
  bootstrapPlayers: number;
  fixtures: number;
  fixtureSnapshotRows: number;
  gameweeks: number;
  gw1Fixtures: number;
  gw1Teams: number;
  profilesWithoutGw1Fixture: number;
  priors: number;
  sourceRegistrations: number;
  resolvedProfiles: number;
  unavailableProfiles: number;
}

export function buildGw1ReadinessChecks(coverage: Gw1ReadinessCoverage) {
  const checks = {
    completeTeams: coverage.teams === 20,
    completeRoster: coverage.players === coverage.bootstrapPlayers,
    completeFixtures:
      coverage.fixtures === 380 && coverage.fixtureSnapshotRows === 380,
    completeGameweeks: coverage.gameweeks === 38,
    completeGw1Fixtures:
      coverage.gw1Fixtures === 10 && coverage.gw1Teams === 20,
    completePlayerFixtures: coverage.profilesWithoutGw1Fixture === 0,
    completePriors: coverage.priors === coverage.sourceRegistrations,
    completeProfiles: coverage.resolvedProfiles === coverage.players,
    explicitAvailability: coverage.unavailableProfiles === 0,
  };
  return { checks, ready: Object.values(checks).every(Boolean) };
}

interface Gw1PlayerProfile {
  seasonPlayerId: number;
  fplId: number;
  playerId: number;
  team: string;
  position: string;
  price: number;
  availability: {
    status: string;
    chanceOfPlaying: number | null;
  };
  gw1Fixtures: Array<{
    fixtureId: number;
    opponent: string;
    isHome: boolean;
  }>;
  provenance: "PLAYER_PRIOR" | "POSITION_BASELINE";
  confidence: PriorConfidence;
  confidenceScore: number;
  uncertaintyReasons: string[];
  priorMetrics: {
    xG90: number | null;
    xA90: number | null;
    touches90: number | null;
    keyPasses90: number | null;
    carries90: number | null;
    defconActions90: number | null;
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function priorReasons(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((reason): reason is string => typeof reason === "string")
    : [];
}

export interface Gw1ReadinessResult {
  targetSeason: string;
  priorVersion: string;
  snapshotId: number;
  checksum: string;
  reused: boolean;
  ready: boolean;
  coverage: Gw1ReadinessCoverage;
  checks: Record<string, boolean>;
  confidence: Record<PriorConfidence, number>;
  uncertainty: Record<string, number>;
}

export class Gw1ReadinessService {
  constructor(private readonly prisma: PrismaClient) {}

  async build(input: {
    targetSeasonCode: string;
    priorVersion?: string;
  }): Promise<Gw1ReadinessResult> {
    const priorVersion = input.priorVersion ?? DEFAULT_PRIOR_VERSION;
    const targetSeason = await this.prisma.season.findUnique({
      where: { code: input.targetSeasonCode },
      select: { id: true, code: true, isCurrent: true, status: true },
    });
    if (!targetSeason)
      throw new Error(`Season ${input.targetSeasonCode} not found`);
    if (targetSeason.isCurrent || targetSeason.status !== "UPCOMING") {
      throw new Error(
        `GW1 readiness requires an unpublished UPCOMING season; ${targetSeason.code} is not eligible`,
      );
    }

    const config = await this.prisma.predictionConfigVersion.findUnique({
      where: { version: priorVersion },
      select: { id: true, sourceSeasonId: true, frozenAt: true },
    });
    if (!config?.frozenAt) {
      throw new Error(`Frozen prior configuration ${priorVersion} not found`);
    }

    const [
      bootstrap,
      fixtureSnapshot,
      sourceRegistrations,
      teams,
      players,
      fixtures,
      priors,
    ] = await Promise.all([
      this.prisma.sourceSnapshot.findFirst({
        where: {
          seasonId: targetSeason.id,
          source: "fpl",
          dataset: "bootstrap-static",
          valid: true,
        },
        orderBy: { fetchedAt: "desc" },
        select: { id: true, recordCount: true, checksum: true },
      }),
      this.prisma.sourceSnapshot.findFirst({
        where: {
          seasonId: targetSeason.id,
          source: "fpl",
          dataset: "fixtures",
          valid: true,
        },
        orderBy: { fetchedAt: "desc" },
        select: { id: true, recordCount: true, checksum: true },
      }),
      this.prisma.seasonPlayer.count({
        where: { seasonId: config.sourceSeasonId },
      }),
      this.prisma.seasonTeam.count({
        where: { seasonId: targetSeason.id, active: true },
      }),
      this.prisma.seasonPlayer.findMany({
        where: { seasonId: targetSeason.id, active: true },
        include: { seasonTeam: { select: { teamId: true, shortName: true } } },
        orderBy: { fplId: "asc" },
      }),
      this.prisma.match.findMany({
        where: { seasonId: targetSeason.id },
        select: {
          fplId: true,
          gameweek: true,
          homeSeasonTeamId: true,
          awaySeasonTeamId: true,
          homeSeasonTeam: { select: { shortName: true } },
          awaySeasonTeam: { select: { shortName: true } },
        },
      }),
      this.prisma.playerSeasonPrior.findMany({
        where: {
          sourceSeasonId: config.sourceSeasonId,
          configVersionId: config.id,
          targetSeasonCode: targetSeason.code,
        },
        include: { sourceSeasonPlayer: { include: { seasonTeam: true } } },
      }),
    ]);
    if (!bootstrap || !fixtureSnapshot) {
      throw new Error(
        "Validated 2026/27 FPL bootstrap and fixture snapshots are required",
      );
    }

    const sourceTeams = new Set(
      (
        await this.prisma.seasonTeam.findMany({
          where: { seasonId: config.sourceSeasonId },
          select: { teamId: true },
        })
      ).map((team) => team.teamId),
    );
    const priorsByPlayerId = new Map(
      priors.map((prior) => [prior.playerId, prior]),
    );
    const gw1FixturesByTeam = new Map<
      number,
      Array<{ fixtureId: number; opponent: string; isHome: boolean }>
    >();
    for (const fixture of fixtures.filter(
      (fixture) => fixture.gameweek === 1,
    )) {
      const homeFixtures =
        gw1FixturesByTeam.get(fixture.homeSeasonTeamId) ?? [];
      homeFixtures.push({
        fixtureId: fixture.fplId,
        opponent: fixture.awaySeasonTeam.shortName,
        isHome: true,
      });
      gw1FixturesByTeam.set(fixture.homeSeasonTeamId, homeFixtures);
      const awayFixtures =
        gw1FixturesByTeam.get(fixture.awaySeasonTeamId) ?? [];
      awayFixtures.push({
        fixtureId: fixture.fplId,
        opponent: fixture.homeSeasonTeam.shortName,
        isHome: false,
      });
      gw1FixturesByTeam.set(fixture.awaySeasonTeamId, awayFixtures);
    }

    const profiles: Gw1PlayerProfile[] = players.map((player) => {
      const prior = priorsByPlayerId.get(player.playerId);
      const adjusted = applyUncertaintyFlags(prior?.confidenceScore ?? 0.7, {
        transfer:
          prior != null &&
          prior.sourceSeasonPlayer.seasonTeam.teamId !==
            player.seasonTeam.teamId,
        positionChange:
          prior != null && prior.sourcePosition !== player.position,
        promotedTeam: !sourceTeams.has(player.seasonTeam.teamId),
        noPlHistory: prior == null || prior.minutes === 0,
      });
      return {
        seasonPlayerId: player.id,
        fplId: player.fplId,
        playerId: player.playerId,
        team: player.seasonTeam.shortName,
        position: player.position,
        price: player.nowCost,
        availability: {
          status: player.status ?? "unknown",
          chanceOfPlaying: player.chanceOfPlaying,
        },
        gw1Fixtures: gw1FixturesByTeam.get(player.seasonTeamId) ?? [],
        provenance: prior ? "PLAYER_PRIOR" : "POSITION_BASELINE",
        confidence: adjusted.confidence,
        confidenceScore: adjusted.score,
        uncertaintyReasons: [
          ...new Set([
            ...priorReasons(prior?.uncertaintyReasons ?? []),
            ...adjusted.reasons,
          ]),
        ].sort(),
        priorMetrics: {
          xG90: prior?.xG90 ?? null,
          xA90: prior?.xA90 ?? null,
          touches90: prior?.touches90 ?? null,
          keyPasses90: prior?.keyPasses90 ?? null,
          carries90: prior?.carries90 ?? null,
          defconActions90: prior?.defconActions90 ?? null,
        },
      };
    });
    const coverage: Gw1ReadinessCoverage = {
      teams,
      players: players.length,
      bootstrapPlayers: bootstrap.recordCount,
      fixtures: fixtures.length,
      fixtureSnapshotRows: fixtureSnapshot.recordCount,
      gameweeks: new Set(fixtures.map((fixture) => fixture.gameweek)).size,
      gw1Fixtures: fixtures.filter((fixture) => fixture.gameweek === 1).length,
      gw1Teams: gw1FixturesByTeam.size,
      profilesWithoutGw1Fixture: profiles.filter(
        (profile) => profile.gw1Fixtures.length === 0,
      ).length,
      priors: priors.length,
      sourceRegistrations,
      resolvedProfiles: profiles.length,
      unavailableProfiles: profiles.filter(
        (profile) => profile.availability.status === "unknown",
      ).length,
    };
    const { checks, ready } = buildGw1ReadinessChecks(coverage);
    const confidence = profiles.reduce<Record<PriorConfidence, number>>(
      (counts, profile) => ({
        ...counts,
        [profile.confidence]: counts[profile.confidence] + 1,
      }),
      { HIGH: 0, MEDIUM: 0, LOW: 0 },
    );
    const uncertainty = profiles
      .flatMap((profile) => profile.uncertaintyReasons)
      .reduce<
        Record<string, number>
      >((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
    const payload = {
      schemaVersion: 1,
      targetSeason: targetSeason.code,
      priorVersion,
      publicationReady: false,
      activationRequested: false,
      inputs: {
        bootstrapSnapshot: bootstrap,
        fixtureSnapshot,
      },
      coverage,
      checks,
      ready,
      confidence,
      uncertainty,
      profiles,
    };
    const checksum = digest(payload);
    const existing = await this.prisma.sourceSnapshot.findFirst({
      where: {
        seasonId: targetSeason.id,
        source: "internal",
        dataset: "gw1-readiness",
        checksum,
        valid: ready,
      },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    const snapshot = existing
      ? { id: existing.id, reused: true }
      : {
          id: (
            await this.prisma.sourceSnapshot.create({
              data: {
                seasonId: targetSeason.id,
                source: "internal",
                dataset: "gw1-readiness",
                season: targetSeason.code,
                sourceSeasonId: priorVersion,
                gameweek: 1,
                batchId: randomUUID(),
                schemaVersion: 1,
                fetchedAt: new Date(),
                checksum,
                valid: ready,
                error: ready
                  ? null
                  : Object.entries(checks)
                      .filter(([, passed]) => !passed)
                      .map(([name]) => name)
                      .join(", "),
                recordCount: profiles.length,
                payload: payload as unknown as Prisma.InputJsonValue,
              },
            })
          ).id,
          reused: false,
        };
    return {
      targetSeason: targetSeason.code,
      priorVersion,
      snapshotId: snapshot.id,
      checksum,
      reused: snapshot.reused,
      ready,
      coverage,
      checks,
      confidence,
      uncertainty,
    };
  }
}
