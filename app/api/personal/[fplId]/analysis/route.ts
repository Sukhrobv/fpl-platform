import { NextRequest, NextResponse } from "next/server";
import { SquadAnalysisService } from "@/lib/services/squad-analysis-service";
import { prisma } from "@/lib/db";

const analysisService = new SquadAnalysisService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fplId: string }> }
) {
  try {
    const { fplId: fplIdParam } = await params;
    const fplId = parseInt(fplIdParam, 10);
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

    const analysis = await analysisService.analyzeSquad(user.id);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Error analyzing squad:", error);
    return NextResponse.json({ error: "Failed to analyze squad" }, { status: 500 });
  }
}
