import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { ryanairCheapestPerDay } from "@/lib/ryanair";
import { voloteaSchedule } from "@/lib/volotea";
import type { DayFare, SearchResult } from "@/lib/types";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// All calendar dates [from..to] inclusive, as YYYY-MM-DD (UTC).
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Merge per-airline day scans into one row per date: available if any carrier
// flies, price/carrier = the cheapest available fare that day.
function mergeDays(
  dateFrom: string,
  dateTo: string,
  currency: string,
  sources: DayFare[][],
): DayFare[] {
  const byDate = new Map<string, DayFare[]>();
  for (const src of sources) {
    for (const d of src) {
      if (!d.available || d.price == null) continue;
      (byDate.get(d.date) ?? byDate.set(d.date, []).get(d.date)!).push(d);
    }
  }
  return enumerateDates(dateFrom, dateTo).map((date) => {
    const cands = byDate.get(date) ?? [];
    if (cands.length === 0) {
      return { date, available: false, price: null, currency, carrier: null };
    }
    const best = cands.reduce((a, b) => (b.price! < a.price! ? b : a));
    return {
      date,
      available: true,
      price: best.price,
      currency: best.currency,
      carrier: best.carrier ?? null,
    };
  });
}

// Run a direct-flight scan for a route over a date range (Ryanair only, for
// now), persist it as the owner's search history, and return the per-day result.
export async function POST(req: NextRequest) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body = await req.json();
    const originCode = String(body.originCode || "").trim().toUpperCase();
    const destCode = String(body.destCode || "").trim().toUpperCase();
    const dateFrom = String(body.dateFrom || "").trim();
    const dateTo = String(body.dateTo || "").trim();
    const currency = String(body.currency || "EUR").trim().toUpperCase();

    if (originCode.length !== 3 || destCode.length !== 3) {
      return NextResponse.json({ error: "bad airport code" }, { status: 400 });
    }
    if (originCode === destCode) {
      return NextResponse.json({ error: "same airport" }, { status: 400 });
    }
    if (!DATE.test(dateFrom) || !DATE.test(dateTo) || dateFrom > dateTo) {
      return NextResponse.json({ error: "bad date range" }, { status: 400 });
    }

    // Query every airline source in parallel; one failing must not sink the rest.
    const [ry, vo] = await Promise.allSettled([
      ryanairCheapestPerDay(originCode, destCode, dateFrom, dateTo, currency),
      voloteaSchedule(originCode, destCode, dateFrom, dateTo, currency),
    ]);
    if (ry.status === "rejected" && vo.status === "rejected") {
      const msg = ry.reason instanceof Error ? ry.reason.message : "upstream error";
      return NextResponse.json({ error: `Источники недоступны: ${msg}` }, { status: 502 });
    }
    const sources: DayFare[][] = [];
    if (ry.status === "fulfilled") sources.push(ry.value);
    if (vo.status === "fulfilled") sources.push(vo.value);
    const days = mergeDays(dateFrom, dateTo, currency, sources);

    const saved = await prisma.search.create({
      data: {
        ownerKey: owner,
        originCode,
        destCode,
        dateFrom,
        dateTo,
        currency,
        results: days,
      },
    });

    const result: SearchResult = {
      id: saved.id,
      originCode,
      destCode,
      dateFrom,
      dateTo,
      currency,
      days,
      createdAt: saved.createdAt.toISOString(),
    };
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
