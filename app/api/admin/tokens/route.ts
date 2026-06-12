import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest, maskKey } from "@/lib/admin";

export const runtime = "nodejs";

// List tokens (keys masked). Admin only.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tokens = await prisma.apiToken.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(
    tokens.map((t) => ({
      id: t.id,
      label: t.label,
      keyMask: maskKey(t.key),
      enabled: t.enabled,
      unitsLimit: t.unitsLimit,
      unitsRemaining: t.unitsRemaining,
      requestsLimit: t.requestsLimit,
      requestsRemaining: t.requestsRemaining,
      resetAt: t.resetAt?.toISOString() ?? null,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    })),
  );
}

// Create a token. Admin only.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!label || !key) return NextResponse.json({ error: "label and key required" }, { status: 400 });
  const t = await prisma.apiToken.create({ data: { label, key } });
  return NextResponse.json({ id: t.id });
}
