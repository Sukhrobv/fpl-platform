import { NextRequest, NextResponse } from "next/server";
import { FPLContextService } from "@/lib/services/fpl-context-service";
import { getBootstrapData } from "@/lib/fplClient";

const contextService = new FPLContextService();

export async function GET(request: NextRequest) {
  try {
    // Get current GW from bootstrap
    const bootstrap = await getBootstrapData();
    const currentEvent = bootstrap.events.find(e => e.is_current);
    
    if (!currentEvent) {
      return NextResponse.json({ error: "No current gameweek found" }, { status: 404 });
    }

    const eliteEoMap = await contextService.getEliteOwnership(currentEvent.id);
    
    return NextResponse.json({
      gameweek: currentEvent.id,
      eliteEoMap
    });
  } catch (error) {
    console.error("Error fetching context:", error);
    return NextResponse.json({ error: "Failed to fetch context" }, { status: 500 });
  }
}
