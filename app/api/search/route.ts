import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { connectSearch } from "@/lib/connect";

export const runtime = "nodejs";

const CODE = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A→B connection search over a day-period (direct / via-hub / via-nearby).
export async function POST(req: NextRequest) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body = await req.json();
    const origin = String(body.originCode || "").trim().toUpperCase();
    const dest = String(body.destCode || "").trim().toUpperCase();
    const dateFrom = String(body.dateFrom || "").trim();
    const dateTo = String(body.dateTo || "").trim();
    const maxDistKm = Math.max(0, Math.min(1000, Number(body.maxDistKm) || 0));
    const maxLayoverMin = Math.max(60, Math.min(4320, Number(body.maxLayoverMin) || 240));

    if (!CODE.test(origin) || !CODE.test(dest)) {
      return NextResponse.json({ error: "bad airport code" }, { status: 400 });
    }
    if (origin === dest) return NextResponse.json({ error: "same airport" }, { status: 400 });
    if (!DATE.test(dateFrom) || !DATE.test(dateTo) || dateFrom > dateTo) {
      return NextResponse.json({ error: "bad date range" }, { status: 400 });
    }

    let itineraries;
    try {
      itineraries = await connectSearch({ origin, dest, dateFrom, dateTo, maxDistKm, maxLayoverMin });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "engine error";
      return NextResponse.json({ error: `Источник недоступен: ${msg}` }, { status: 502 });
    }

    const saved = await prisma.search.create({
      data: { ownerKey: owner, originCode: origin, destCode: dest, dateFrom, dateTo, maxDistKm, maxLayoverMin, results: itineraries },
    });

    return NextResponse.json({ id: saved.id, origin, dest, dateFrom, dateTo, maxDistKm, maxLayoverMin, itineraries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
