import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Latest AeroDataBox quota snapshot (written after every upstream call).
export async function GET() {
  try {
    const q = await prisma.apiQuota.findUnique({ where: { provider: "aerodatabox" } });
    if (!q) return NextResponse.json(null);
    return NextResponse.json({
      unitsLimit: q.unitsLimit,
      unitsRemaining: q.unitsRemaining,
      requestsLimit: q.requestsLimit,
      requestsRemaining: q.requestsRemaining,
      resetAt: q.resetAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json(null);
  }
}
