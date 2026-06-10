import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Public reference data: airport autocomplete by IATA code, city or name.
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json([]);

    // Exact IATA code match first, then city/name contains.
    const upper = q.toUpperCase();
    const airports = await prisma.airport.findMany({
      where: {
        OR: [
          { code: { equals: upper } },
          { city: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      orderBy: [{ code: "asc" }],
    });

    // Bubble an exact code match to the top.
    airports.sort((a, b) =>
      a.code === upper ? -1 : b.code === upper ? 1 : 0,
    );
    return NextResponse.json(airports);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
