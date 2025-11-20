import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse, PaginatedResponse, Team } from "@/types";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const sortBy = searchParams.get("sortBy") ?? "name";
  const sortDir = (searchParams.get("sortDir") ?? "asc") as "asc" | "desc";
  const include = searchParams.get("include"); // "players" or "playerCount"

  const orderBy: Prisma.TeamOrderByWithRelationInput = {};
  
  if (sortBy === "name") {
    orderBy.name = sortDir;
  } else if (sortBy === "shortName") {
    orderBy.shortName = sortDir;
  } else {
    orderBy.name = "asc";
  }

  try {
    const [items, total] = await Promise.all([
      prisma.team.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          _count: include === "playerCount" ? { select: { players: true } } : false,
          players: include === "players" ? { 
            select: { 
              id: true, 
              webName: true, 
              position: true, 
              nowCost: true,
              totalPoints: true 
            } 
          } : false,
        }
      }),
      prisma.team.count(),
    ]);

    return NextResponse.json<ApiResponse<PaginatedResponse<Team>>>(
      {
        success: true,
        data: {
          items: items as unknown as Team[],
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
        error: error instanceof Error ? error.message : "Failed to fetch teams",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return NextResponse.json(
    { success: false, error: "Read-only endpoint" }, 
    { status: 405 }
  );
}
