import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Public reference data: airport autocomplete by IATA code, city or name,
// OR (map mode) airports inside a geographic bounding box.
export async function GET(req: NextRequest) {
  try {
    // Map mode: ?bbox=minLon,minLat,maxLon,maxLat → airports in viewport.
    const bbox = (req.nextUrl.searchParams.get("bbox") || "").trim();
    if (bbox) {
      const p = bbox.split(",").map(Number);
      if (p.length !== 4 || p.some((n) => Number.isNaN(n))) {
        return NextResponse.json({ error: "bad bbox" }, { status: 400 });
      }
      const [minLon, minLat, maxLon, maxLat] = p;
      const inBox = await prisma.airport.findMany({
        where: {
          lat: { gte: minLat, lte: maxLat },
          lon: { gte: minLon, lte: maxLon },
        },
        take: 300,
      });
      return NextResponse.json(inBox);
    }

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
