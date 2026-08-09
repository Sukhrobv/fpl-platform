import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  preseasonSquadDraftCreateSchema,
  type PreseasonSquadDraftState,
} from "@/lib/services/preseasonSquadDraftService";

const DEFAULT_SEASON = "2026/27";

function parseSeason(request: Request) {
  const season =
    new URL(request.url).searchParams.get("season") ?? DEFAULT_SEASON;
  return /^\d{4}\/\d{2}$/.test(season) ? season : null;
}

async function eligibleSeasonWithPreview(code: string) {
  const season = await prisma.season.findUnique({
    where: { code },
    select: { id: true, code: true, status: true, isCurrent: true },
  });
  if (!season || season.status !== "UPCOMING" || season.isCurrent) return null;

  const snapshot = await prisma.sourceSnapshot.findFirst({
    where: {
      seasonId: season.id,
      source: "internal",
      dataset: "gw1-preseason-projection-preview",
      valid: true,
    },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  return snapshot ? { season, snapshot } : null;
}

async function ensureSeasonPlayers(
  seasonId: number,
  state: PreseasonSquadDraftState,
) {
  if (!state.playerIds.length) return true;
  const count = await prisma.seasonPlayer.count({
    where: {
      seasonId,
      active: true,
      id: { in: state.playerIds },
    },
  });
  return count === state.playerIds.length;
}

function draftResponse(draft: {
  id: number;
  name: string;
  playerIds: unknown;
  starterIds: unknown;
  captainId: number | null;
  viceCaptainId: number | null;
  bank: number;
  previewSnapshotId: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: draft.id,
    name: draft.name,
    state: {
      playerIds: draft.playerIds,
      starterIds: draft.starterIds,
      captainId: draft.captainId,
      viceCaptainId: draft.viceCaptainId,
      bank: draft.bank,
    },
    previewSnapshotId: draft.previewSnapshotId,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export async function GET(request: Request) {
  const seasonCode = parseSeason(request);
  if (!seasonCode)
    return NextResponse.json({ error: "Invalid season code" }, { status: 400 });
  const context = await eligibleSeasonWithPreview(seasonCode);
  if (!context)
    return NextResponse.json(
      {
        error: "Drafts require an UPCOMING, non-current season with a preview",
      },
      { status: 409 },
    );

  const drafts = await prisma.preseasonSquadDraft.findMany({
    where: { seasonId: context.season.id },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(
    {
      season: context.season.code,
      snapshotId: context.snapshot.id,
      drafts: drafts.map(draftResponse),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const parsed = preseasonSquadDraftCreateSchema.safeParse(
    await request.json(),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );

  const context = await eligibleSeasonWithPreview(parsed.data.season);
  if (!context)
    return NextResponse.json(
      {
        error: "Drafts require an UPCOMING, non-current season with a preview",
      },
      { status: 409 },
    );
  if (!(await ensureSeasonPlayers(context.season.id, parsed.data.state))) {
    return NextResponse.json(
      { error: "Draft includes a player outside the current season" },
      { status: 400 },
    );
  }

  const draft = await prisma.preseasonSquadDraft.create({
    data: {
      seasonId: context.season.id,
      name: parsed.data.name,
      playerIds: parsed.data.state.playerIds,
      starterIds: parsed.data.state.starterIds,
      captainId: parsed.data.state.captainId,
      viceCaptainId: parsed.data.state.viceCaptainId,
      bank: parsed.data.state.bank,
      previewSnapshotId: context.snapshot.id,
    },
  });
  return NextResponse.json({ draft: draftResponse(draft) }, { status: 201 });
}
