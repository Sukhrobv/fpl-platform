import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ApiResponse, PaginatedResponse, Team } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const [items, total] = await Promise.all([
    prisma.team.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.team.count(),
  ]);

  return NextResponse.json<ApiResponse<PaginatedResponse<Team>>>(
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
    const team = await prisma.team.create({ data });
    return NextResponse.json<ApiResponse<Team>>(
      { success: true, data: team },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create team";
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }
}
