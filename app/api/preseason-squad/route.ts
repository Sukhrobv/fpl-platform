import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
