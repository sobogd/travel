import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Aggregate AeroDataBox quota across all enabled tokens (sum of remaining/limit
// api-units, soonest reset). Drives the header badge.
export async function GET() {
  try {
    const tokens = await prisma.apiToken.findMany({ where: { enabled: true } });
    if (tokens.length === 0) return NextResponse.json(null);
    const now = Date.now();
    let unitsRemaining = 0;
    let unitsLimit = 0;
    let resetAt: Date | null = null;
    for (const t of tokens) {
      const replenished = t.resetAt != null && t.resetAt.getTime() < now;
      unitsRemaining += replenished ? t.unitsLimit : t.unitsRemaining;
      unitsLimit += t.unitsLimit;
      if (t.resetAt && !replenished && (!resetAt || t.resetAt < resetAt)) resetAt = t.resetAt;
    }
    return NextResponse.json({
      tokens: tokens.length,
      unitsRemaining,
      unitsLimit,
      resetAt: resetAt ? resetAt.toISOString() : null,
    });
  } catch {
    return NextResponse.json(null);
  }
}
