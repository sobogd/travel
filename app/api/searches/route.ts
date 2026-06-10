import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";

export const runtime = "nodejs";

// List the owner's recent searches (history).
export async function GET(req: NextRequest) {
  try {
    const owner = resolveOwner(req);
    if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!isAllowed(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const searches = await prisma.search.findMany({
      where: { ownerKey: owner },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(searches);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
