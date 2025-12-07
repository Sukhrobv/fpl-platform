import { NextRequest, NextResponse } from "next/server";
import { TransferAdvisorService } from "@/lib/services/transfer-advisor-service";
import { prisma } from "@/lib/db";

const service = new TransferAdvisorService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fplId: string }> }
) {
  try {
    const { fplId: fplIdParam } = await params;
    const fplId = parseInt(fplIdParam);
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

    const recommendations = await service.generateRecommendations(user.id);
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 });
  }
}
