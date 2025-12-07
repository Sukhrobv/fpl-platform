import { NextRequest, NextResponse } from "next/server";
import { FPLPersonalService } from "@/lib/services/fpl-personal-service";
import { prisma } from "@/lib/db";

const service = new FPLPersonalService();

export async function GET(
  request: NextRequest,
  { params }: { params: { fplId: string } }
) {
  try {
    const fplId = parseInt(params.fplId);
    if (isNaN(fplId)) {
      return NextResponse.json({ error: "Invalid FPL ID" }, { status: 400 });
    }

    // Find internal user ID first
    const user = await prisma.user.findUnique({
      where: { fplTeamId: fplId }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found. Please sync first." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const gameweekParam = searchParams.get('gameweek');
    const gameweek = gameweekParam ? parseInt(gameweekParam) : undefined;

    const squad = await service.getSquad(user.id, gameweek);
    return NextResponse.json(squad);
  } catch (error) {
    console.error("Error fetching squad:", error);
    return NextResponse.json({ error: "Failed to fetch squad" }, { status: 500 });
  }
}
