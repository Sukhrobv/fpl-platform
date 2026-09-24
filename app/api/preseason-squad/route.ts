import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ROLLING_PREDICTION_DATASET,
  type RollingPredictionPayload,
} from "@/lib/services/rollingPredictionService";

const DEFAULT_SEASON = "2026/27";

export async function GET(request: Request) {
  const requestedSeason = new URL(request.url).searchParams.get("season");
  const seasonCode = requestedSeason ?? DEFAULT_SEASON;
  if (!/^\d{4}\/\d{2}$/.test(seasonCode)) {
    return NextResponse.json({ error: "Invalid season code" }, { status: 400 });
  }

  const season = await prisma.season.findUnique({
    where: { code: seasonCode },
    select: { id: true, code: true, status: true, isCurrent: true },
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
      return NextResponse.json(
        { error: "Rolling squad snapshot belongs to another season" },
        { status: 409 },
      );
    }
    const activeRegistrations = await prisma.seasonPlayer.findMany({
      where: { seasonId: season.id, active: true },
      select: { id: true, status: true, chanceOfPlaying: true },
    });
    const registrationsById = new Map(
      activeRegistrations.map((player) => [player.id, player]),
    );
    const predictedIds = new Set(
      rolling.projections.map((projection) => projection.seasonPlayerId),
    );
    const missingIds = activeRegistrations
      .map((player) => player.id)
      .filter((id) => !predictedIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: `Rolling squad snapshot is missing ${missingIds.length} active players`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        season: {
          code: season.code,
          status: season.status,
          isCurrent: season.isCurrent,
        },
        snapshot: {
          id: rollingSnapshot.id,
          fetchedAt: rollingSnapshot.fetchedAt,
        },
        preview: {
          methodology: rolling.methodology,
          projections: rolling.projections.map((projection) => {
            const firstFixture = projection.fixtures[0];
            const registration = registrationsById.get(
              projection.seasonPlayerId,
            );
            const availability =
              registration?.chanceOfPlaying != null
                ? registration.chanceOfPlaying / 100
                : registration?.status?.toLowerCase() === "a"
                  ? 1
                  : 0.65;
            const startGivenAvailable = firstFixture?.startProbability ?? 0;
            const sixtyMinuteProbability = Math.min(
              startGivenAvailable * 0.92,
              (firstFixture?.expectedMinutes ?? 0) / 60,
            );
            return {
              ...projection,
              availability: {
                status: registration?.status ?? "unknown",
                chanceOfPlaying: registration?.chanceOfPlaying ?? null,
              },
              reliability: {
                availabilityProbability: availability,
                startGivenAvailableProbability: startGivenAvailable,
                sixtyMinuteProbability,
                roleContinuity: projection.confidenceScore,
                evidenceQuality: projection.confidenceScore,
                score: Number(
                  (
                    (sixtyMinuteProbability * 0.6 +
                      projection.confidenceScore * 0.4) *
                    100
                  ).toFixed(1),
                ),
                reasons: projection.limitations,
              },
            };
          }),
        },
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
    return NextResponse.json(
      { error: "GW1 preseason preview is not ready" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      season: {
        code: season.code,
        status: season.status,
        isCurrent: season.isCurrent,
      },
      snapshot: { id: snapshot.id, fetchedAt: snapshot.fetchedAt },
      preview: snapshot.payload,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
