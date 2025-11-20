import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse, PaginatedResponse } from "@/types";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  
  const gameweek = searchParams.get("gameweek");
  const teamId = searchParams.get("teamId");
  const finished = searchParams.get("finished");
  const future = searchParams.get("future");

  const where: Prisma.MatchWhereInput = {};

  if (gameweek) where.gameweek = Number(gameweek);
  
  if (teamId) {
    const tid = Number(teamId);
    where.OR = [
      { homeTeamId: tid },
      { awayTeamId: tid }
    ];
  }

  if (finished === "true") where.finished = true;
  if (finished === "false") where.finished = false;
  
  if (future === "true") {
    where.kickoffTime = { gt: new Date() };
  }

  try {
    const [items, total] = await Promise.all([
      prisma.match.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { kickoffTime: "asc" },
        include: {
          homeTeam: { select: { id: true, name: true, shortName: true } },
          awayTeam: { select: { id: true, name: true, shortName: true } },
        }
      }),
      prisma.match.count({ where }),
    ]);

    return NextResponse.json<ApiResponse<PaginatedResponse<unknown>>>(
      {
        success: true,
        data: {
          items,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch fixtures",
      },
      { status: 500 },
    );
  }
}
