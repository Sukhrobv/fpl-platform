import { NextRequest, NextResponse } from "next/server";
import { ChipStrategyService } from "@/lib/services/chip-strategy-service";
import { prisma } from "@/lib/db";

const chipService = new ChipStrategyService();

export async function GET(
  request: NextRequest,
  { params }: { params: { fplId: string } }
) {
  try {
    const fplId = parseInt(params.fplId, 10);
    if (isNaN(fplId)) {
      return NextResponse.json({ error: "Invalid FPL ID" }, { status: 400 });
    }

    // Find internal user ID
    const user = await prisma.user.findUnique({
      where: { fplTeamId: fplId }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const chipRecommendations = await chipService.analyzeChipOpportunities(user.id);
    return NextResponse.json(chipRecommendations);
  } catch (error) {
    console.error("Error analyzing chip opportunities:", error);
    return NextResponse.json({ error: "Failed to analyze chips" }, { status: 500 });
  }
}
