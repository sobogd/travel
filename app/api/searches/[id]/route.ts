import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import type { DayFare, SearchResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { id } = await params;
    const s = await prisma.search.findUnique({ where: { id } });
    if (!s || s.ownerKey !== owner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const result: SearchResult = {
      id: s.id,
      originCode: s.originCode,
      destCode: s.destCode,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      currency: s.currency,
      days: (s.results as unknown as DayFare[]) ?? [],
      createdAt: s.createdAt.toISOString(),
    };
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { id } = await params;
    const s = await prisma.search.findUnique({ where: { id } });
    if (!s || s.ownerKey !== owner) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    await prisma.search.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
