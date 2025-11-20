import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse, PaginatedResponse, Player, Position } from "@/types";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const details = searchParams.get("details") === "true";
  
  // Filters
  const teamId = searchParams.get("teamId");
  const position = searchParams.get("position");
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");

  // Sorting
  const sortBy = searchParams.get("sortBy") ?? "totalPoints";
  const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

  const where: Prisma.PlayerWhereInput = {};

  if (teamId) where.teamId = Number(teamId);
  if (position) where.position = position as Position;
  if (status) where.status = status;
  
  if (minPrice || maxPrice) {
    where.nowCost = {};
    if (minPrice) where.nowCost.gte = Number(minPrice);
    if (maxPrice) where.nowCost.lte = Number(maxPrice);
  }

  if (search) {
    where.OR = [
      { webName: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { secondName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Validate sort field to prevent injection/errors
  const validSortFields = ["totalPoints", "nowCost", "selectedBy", "form", "pointsPerGame", "ictIndex", "influence", "creativity", "threat"];
  const orderBy: Prisma.PlayerOrderByWithRelationInput = {};
  
  if (validSortFields.includes(sortBy)) {
    orderBy[sortBy as keyof Prisma.PlayerOrderByWithRelationInput] = sortDir;
  } else {
    orderBy.totalPoints = "desc";
  }

  // Optimization: Select only necessary fields for list views
  const select = details ? undefined : {
    id: true,
    fplId: true,
    webName: true,
    nowCost: true,
    totalPoints: true,
    position: true,
    status: true,
    news: true,
    chanceOfPlaying: true,
    team: {
      select: {
        shortName: true,
        name: true
      }
    }
  };

  const queryOptions: Prisma.PlayerFindManyArgs = {
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy,
  };

  if (details) {
    queryOptions.include = { team: { select: { shortName: true, name: true } } };
  } else {
    queryOptions.select = select;
  }

  try {
    const [items, total] = await Promise.all([
      prisma.player.findMany(queryOptions),
      prisma.player.count({ where }),
    ]);

    return NextResponse.json<ApiResponse<PaginatedResponse<Partial<Player>>>>(
      {
        success: true,
        data: {
          items: items as unknown as Partial<Player>[],
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch players",
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
