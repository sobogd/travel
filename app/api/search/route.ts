import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { ryanairCheapestPerDay } from "@/lib/ryanair";
import type { DayFare, SearchResult } from "@/lib/types";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

    let days: DayFare[];
    try {
      days = await ryanairCheapestPerDay(originCode, destCode, dateFrom, dateTo, currency);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "upstream error";
      return NextResponse.json({ error: `Источник недоступен: ${msg}` }, { status: 502 });
    }

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
