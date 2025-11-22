import { NextRequest, NextResponse } from "next/server";
import { FPLPersonalService } from "@/lib/services/fpl-personal-service";

const service = new FPLPersonalService();

export async function POST(
  request: NextRequest,
  { params }: { params: { fplId: string } }
) {
  try {
    const fplId = parseInt(params.fplId);
    if (isNaN(fplId)) {
      return NextResponse.json({ error: "Invalid FPL ID" }, { status: 400 });
    }

    const fantasyTeam = await service.syncUserTeam(fplId);
    return NextResponse.json(fantasyTeam);
  } catch (error) {
    console.error("Error syncing team:", error);
    return NextResponse.json({ error: "Failed to sync team" }, { status: 500 });
  }
}
