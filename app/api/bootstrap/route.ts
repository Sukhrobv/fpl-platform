import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse } from "@/types";

export async function GET() {
  try {
    const [teams, gameweek] = await Promise.all([
      prisma.team.findMany({
        orderBy: { name: "asc" },
      }),
      // Find the next deadline or the most recent one
      prisma.match.findFirst({
        where: {
          kickoffTime: { gt: new Date() }
        },
        orderBy: { kickoffTime: "asc" },
        select: { gameweek: true }
      })
    ]);

    const currentGameweek = gameweek?.gameweek ?? 1;

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: true,
        data: {
          teams,
          currentGameweek,
          positions: ["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"],
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch bootstrap data",
      },
      { status: 500 },
    );
  }
}
