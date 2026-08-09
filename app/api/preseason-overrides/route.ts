import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SeasonPredictionPublicationService } from "@/lib/services/seasonPredictionPublicationService";
import {
  normalizePreseasonOverride,
  toAppliedPreseasonOverride,
} from "@/lib/services/preseasonOverrideService";

const DEFAULT_SEASON = "2026/27";

const overrideSchema = z.object({
  season: z
    .string()
    .regex(/^\d{4}\/\d{2}$/)
    .default(DEFAULT_SEASON),
  seasonPlayerId: z.number().int().positive(),
  kind: z.enum([
    "LATE_RETURN",
    "MANAGED_MINUTES",
    "UNAVAILABLE",
    "SELECTION_RISK",
    "CONFIRMED_STARTER",
  ]),
  availabilityCap: z.number().int().min(0).max(100).nullable(),
  startProbabilityCap: z.number().min(0).max(1).nullable(),
  expectedMinutesCap: z.number().int().min(0).max(90).nullable(),
  appliesThroughGameweek: z.number().int().min(1).max(38),
  note: z.string().trim().min(3).max(500),
  sourceUrl: z.string().url().max(1_000).nullable(),
});

function parseSeason(request: Request) {
  const season =
    new URL(request.url).searchParams.get("season") ?? DEFAULT_SEASON;
  return /^\d{4}\/\d{2}$/.test(season) ? season : null;
}

async function eligibleSeason(code: string) {
  const season = await prisma.season.findUnique({
    where: { code },
    select: { id: true, code: true, status: true, isCurrent: true },
  });
  if (!season || season.status !== "UPCOMING" || season.isCurrent) return null;
  return season;
}

export async function GET(request: Request) {
  const seasonCode = parseSeason(request);
  if (!seasonCode)
    return NextResponse.json({ error: "Invalid season code" }, { status: 400 });
  const season = await eligibleSeason(seasonCode);
  if (!season)
    return NextResponse.json(
      { error: "Overrides require an UPCOMING, non-current season" },
      { status: 409 },
    );
  const overrides = await prisma.preseasonOverride.findMany({
    where: { seasonId: season.id, active: true },
    orderBy: [{ appliesThroughGameweek: "asc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json(
    {
      season: season.code,
      overrides: overrides.map((override) => ({
        seasonPlayerId: override.seasonPlayerId,
        ...toAppliedPreseasonOverride(override),
        updatedAt: override.updatedAt,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const parsed = overrideSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  const season = await eligibleSeason(parsed.data.season);
  if (!season)
    return NextResponse.json(
      { error: "Overrides require an UPCOMING, non-current season" },
      { status: 409 },
    );
  const player = await prisma.seasonPlayer.findFirst({
    where: {
      id: parsed.data.seasonPlayerId,
      seasonId: season.id,
      active: true,
    },
    select: { id: true },
  });
  if (!player)
    return NextResponse.json(
      { error: "Season player not found" },
      { status: 404 },
    );
  const data = normalizePreseasonOverride(parsed.data);
  const override = await prisma.preseasonOverride.upsert({
    where: { seasonPlayerId: player.id },
    create: { seasonId: season.id, seasonPlayerId: player.id, ...data },
    update: { ...data, active: true },
  });
  const preview = await new SeasonPredictionPublicationService(
    prisma,
  ).buildGw1Preview({
    targetSeasonCode: season.code,
  });
  return NextResponse.json({
    override: {
      seasonPlayerId: override.seasonPlayerId,
      ...toAppliedPreseasonOverride(override),
      updatedAt: override.updatedAt,
    },
    preview,
  });
}

export async function DELETE(request: Request) {
  const seasonCode = parseSeason(request);
  const seasonPlayerId = Number(
    new URL(request.url).searchParams.get("seasonPlayerId"),
  );
  if (!seasonCode || !Number.isInteger(seasonPlayerId) || seasonPlayerId <= 0) {
    return NextResponse.json(
      { error: "Invalid override target" },
      { status: 400 },
    );
  }
  const season = await eligibleSeason(seasonCode);
  if (!season)
    return NextResponse.json(
      { error: "Overrides require an UPCOMING, non-current season" },
      { status: 409 },
    );
  const override = await prisma.preseasonOverride.findFirst({
    where: { seasonId: season.id, seasonPlayerId, active: true },
  });
  if (!override)
    return NextResponse.json(
      { error: "Active override not found" },
      { status: 404 },
    );
  await prisma.preseasonOverride.update({
    where: { id: override.id },
    data: { active: false },
  });
  const preview = await new SeasonPredictionPublicationService(
    prisma,
  ).buildGw1Preview({
    targetSeasonCode: season.code,
  });
  return NextResponse.json({ seasonPlayerId, preview });
}
