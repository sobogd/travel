import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveOwner, isAllowed } from "@/lib/auth";
import { periodChunks } from "@/lib/connect";
import { getCachedFids, type ParsedFlight } from "@/lib/aerodatabox";

export const runtime = "nodejs";

type PeerRow = { iata: string; name: string | null; city: string | null; country: string | null; flights: number };

// Tally peer airports across a set of cached FIDS, then enrich with city/country
// from the airports table. Sorted by flight count desc.
async function tally(lists: ParsedFlight[][]): Promise<PeerRow[]> {
  const count = new Map<string, { name: string | null; n: number }>();
  for (const list of lists) {
    for (const f of list) {
      if (!f.peerIata) continue;
      const e = count.get(f.peerIata);
      if (e) e.n++;
      else count.set(f.peerIata, { name: f.peerName, n: 1 });
    }
  }
  const codes = [...count.keys()];
  const airports = await prisma.airport.findMany({
    where: { code: { in: codes } },
    select: { code: true, name: true, city: true, country: true },
  });
  const meta = new Map(airports.map((a) => [a.code, a]));
  return codes
    .map((iata) => {
      const c = count.get(iata)!;
      const m = meta.get(iata);
      return {
        iata,
        name: m?.name ?? c.name,
        city: m?.city ?? null,
        country: m?.country ?? null,
        flights: c.n,
      };
    })
    .sort((a, b) => b.flights - a.flights);
}

// Debug: from the FIDS cache only (no API), list which airports/cities are
// actually flown to from the origin and into the dest over the search period.
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

    const chunks = periodChunks(s.dateFrom, s.dateTo);
    const originLists: ParsedFlight[][] = [];
    const destLists: ParsedFlight[][] = [];
    for (const c of chunks) {
      originLists.push(await getCachedFids(s.originCode, "Departure", c.date, c.half));
      destLists.push(await getCachedFids(s.destCode, "Arrival", c.date, c.half));
    }

    const fromOrigin = await tally(originLists);
    const toDest = await tally(destLists);
    const cached = fromOrigin.length > 0 || toDest.length > 0;

    return NextResponse.json({
      origin: s.originCode,
      dest: s.destCode,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
      cached,
      fromOrigin,
      toDest,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
