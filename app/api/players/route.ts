import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse, PaginatedResponse, Player, Position } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const teamId = searchParams.get("teamId");
  const position = searchParams.get("position");

  const where: Record<string, unknown> = {};
  if (teamId) where.teamId = Number(teamId);
  if (position) where.position = position as Position;

  const [items, total] = await Promise.all([
    prisma.player.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.player.count({ where }),
  ]);

  return NextResponse.json<ApiResponse<PaginatedResponse<Player>>>(
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
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const player = await prisma.player.create({ data });
    return NextResponse.json<ApiResponse<Player>>(
      { success: true, data: player },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create player";
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
