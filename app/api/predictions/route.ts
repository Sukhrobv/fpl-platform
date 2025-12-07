import { NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FPLPredictionService } from "@/lib/services/fpl-prediction-service";

const predictionService = new FPLPredictionService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get("position") as Position | null;
    const teamId = searchParams.get("teamId");
    const range = parseInt(searchParams.get("range") || "5", 10);

    // 1) Next distinct gameweeks
    const nextFixtures = await prisma.match.findMany({
      where: { finished: false },
      orderBy: { gameweek: "asc" },
      select: { gameweek: true },
      distinct: ["gameweek"],
      take: range,
    });
    const gameweeks = nextFixtures.map((f) => f.gameweek);
    
    if (gameweeks.length === 0) {
      return NextResponse.json({ gameweeks: [], predictions: [] });
    }

    // 2) Get Projections
    const predictions = await predictionService.getProjections(gameweeks, {
      position: position || undefined,
      teamId: teamId ? parseInt(teamId, 10) : undefined,
    });

    return NextResponse.json({ gameweeks, predictions });
  } catch (error) {
    console.error("Error generating predictions:", error);
    return NextResponse.json({ error: "Failed to generate predictions" }, { status: 500 });
  }
}
