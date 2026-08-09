import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  preseasonSquadDraftUpdateSchema,
  type PreseasonSquadDraftState,
} from "@/lib/services/preseasonSquadDraftService";

async function eligibleDraft(draftId: number) {
  const draft = await prisma.preseasonSquadDraft.findUnique({
    where: { id: draftId },
    include: {
      season: {
        select: { id: true, code: true, status: true, isCurrent: true },
      },
    },
  });
  if (!draft || draft.season.status !== "UPCOMING" || draft.season.isCurrent)
    return null;
  const snapshot = await prisma.sourceSnapshot.findFirst({
    where: {
      seasonId: draft.seasonId,
      source: "internal",
      dataset: "gw1-preseason-projection-preview",
      valid: true,
    },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  return snapshot ? { draft, snapshot } : null;
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

async function parseDraftId(params: Promise<{ draftId: string }>) {
  const { draftId } = await params;
  const id = Number(draftId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const draftId = await parseDraftId(params);
  if (!draftId)
    return NextResponse.json({ error: "Invalid draft ID" }, { status: 400 });
  const parsed = preseasonSquadDraftUpdateSchema.safeParse(
    await request.json(),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  const context = await eligibleDraft(draftId);
  if (!context)
    return NextResponse.json(
      { error: "Draft is unavailable for this season" },
      { status: 404 },
    );
  if (
    parsed.data.state &&
    !(await ensureSeasonPlayers(context.draft.seasonId, parsed.data.state))
  ) {
    return NextResponse.json(
      { error: "Draft includes a player outside the current season" },
      { status: 400 },
    );
  }

  const state = parsed.data.state;
  const draft = await prisma.preseasonSquadDraft.update({
    where: { id: context.draft.id },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      ...(state
        ? {
            playerIds: state.playerIds,
            starterIds: state.starterIds,
            captainId: state.captainId,
            viceCaptainId: state.viceCaptainId,
            bank: state.bank,
          }
        : {}),
      previewSnapshotId: context.snapshot.id,
    },
  });
  return NextResponse.json({ draft: draftResponse(draft) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const draftId = await parseDraftId(params);
  if (!draftId)
    return NextResponse.json({ error: "Invalid draft ID" }, { status: 400 });
  const context = await eligibleDraft(draftId);
  if (!context)
    return NextResponse.json(
      { error: "Draft is unavailable for this season" },
      { status: 404 },
    );
  await prisma.preseasonSquadDraft.delete({ where: { id: context.draft.id } });
  return NextResponse.json({ deletedId: context.draft.id });
}
