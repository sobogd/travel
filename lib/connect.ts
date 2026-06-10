import { prisma } from "./prisma";
import { getFids, type ParsedFlight, type Half } from "./aerodatabox";
import { haversineKm, estGroundMin } from "./geo";

// Connection engine — period mode. Over a whole day-period [dateFrom..dateTo]
// pull every A departure + every B arrival, then build direct / via-hub /
// via-nearby itineraries. Both legs must fall inside the period (no buffer).
// Layover math in UTC. Sorted: direct first, then by layover ascending.

export type Leg = {
  fromIata: string;
  toIata: string;
  fromName: string | null;
  toName: string | null;
  depLocal: string | null;
  arrLocal: string | null;
  airlineIata: string | null;
  airlineName: string | null;
  flightNo: string | null;
};

export type Ground = { fromIata: string; toIata: string; distKm: number; estMin: number };

export type Itinerary = {
  kind: "direct" | "hub" | "nearby";
  legs: Leg[];
  ground?: Ground;
  layoverMin?: number;
  hubIata?: string;
};

export type ConnectInput = {
  origin: string;
  dest: string;
  dateFrom: string; // YYYY-MM-DD (period start, 00:00)
  dateTo: string; // YYYY-MM-DD (period end, 23:59)
  maxDistKm: number;
  maxLayoverMin: number;
};

const utcMs = (s: string | null) => (s ? Date.parse(s) : null);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// minimum layover: 60 min everywhere; for a ground hop add 2h per 100 km.
function minLayover(distKm: number): number {
  return 60 + (distKm / 100) * 120;
}

// every (date, half) chunk across the whole inclusive period
function periodChunks(dateFrom: string, dateTo: string): Array<{ date: string; half: Half }> {
  const out: Array<{ date: string; half: Half }> = [];
  let d = dateFrom;
  for (let i = 0; i < 90 && d <= dateTo; i++) {
    out.push({ date: d, half: "AM" }, { date: d, half: "PM" });
    d = addDays(d, 1);
  }
  return out;
}

export async function connectSearch(input: ConnectInput): Promise<Itinerary[]> {
  const { origin, dest, dateFrom, dateTo, maxDistKm, maxLayoverMin } = input;
  const chunks = periodChunks(dateFrom, dateTo);

  let aDeps: ParsedFlight[] = [];
  for (const c of chunks) aDeps = aDeps.concat(await getFids(origin, "Departure", c.date, c.half));
  let bArrs: ParsedFlight[] = [];
  for (const c of chunks) bArrs = bArrs.concat(await getFids(dest, "Arrival", c.date, c.half));

  // coords for nearby matching
  const codes = new Set<string>();
  for (const f of aDeps) if (f.peerIata) codes.add(f.peerIata);
  for (const f of bArrs) if (f.peerIata) codes.add(f.peerIata);
  const airports = await prisma.airport.findMany({
    where: { code: { in: [...codes] } },
    select: { code: true, name: true, lat: true, lon: true },
  });
  const coord = new Map(airports.map((a) => [a.code, a]));

  const toLeg = (from: string, to: string, f: ParsedFlight, names: [string | null, string | null]): Leg => ({
    fromIata: from,
    toIata: to,
    fromName: names[0],
    toName: names[1],
    depLocal: f.depLocal,
    arrLocal: f.arrLocal,
    airlineIata: f.airlineIata,
    airlineName: f.airlineName,
    flightNo: f.flightNo,
  });

  const out: Itinerary[] = [];

  // 1) DIRECT
  for (const f of aDeps) {
    if (f.peerIata === dest) {
      out.push({ kind: "direct", legs: [toLeg(origin, dest, f, [null, f.peerName])] });
    }
  }

  // index B arrivals by their origin (the hub) iata
  const byOrigin = new Map<string, ParsedFlight[]>();
  for (const f of bArrs) {
    if (!f.peerIata) continue;
    (byOrigin.get(f.peerIata) ?? byOrigin.set(f.peerIata, []).get(f.peerIata)!).push(f);
  }

  for (const a of aDeps) {
    const C = a.peerIata;
    if (!C || C === dest) continue;
    const t1 = utcMs(a.arrUtc); // land at C
    if (t1 == null) continue;

    // 2) HUB — same airport C (min layover 60)
    for (const b of byOrigin.get(C) ?? []) {
      const t2 = utcMs(b.depUtc);
      if (t2 == null || t2 < t1) continue;
      const lay = (t2 - t1) / 60000;
      if (lay < minLayover(0) || lay > maxLayoverMin) continue;
      out.push({
        kind: "hub",
        hubIata: C,
        layoverMin: Math.round(lay),
        legs: [toLeg(origin, C, a, [null, a.peerName]), toLeg(C, dest, b, [b.peerName, null])],
      });
    }

    // 3) NEARBY — land C, ground to D (≤ R), fly D→B (min layover 60 + 2h/100km)
    const cc = coord.get(C);
    if (!cc || cc.lat == null || cc.lon == null) continue;
    for (const b of bArrs) {
      const D = b.peerIata;
      if (!D || D === C) continue;
      const dc = coord.get(D);
      if (!dc || dc.lat == null || dc.lon == null) continue;
      const dist = haversineKm(cc.lat, cc.lon, dc.lat, dc.lon);
      if (dist > maxDistKm) continue;
      const t2 = utcMs(b.depUtc);
      if (t2 == null || t2 < t1) continue;
      const lay = (t2 - t1) / 60000;
      if (lay < minLayover(dist) || lay > maxLayoverMin) continue;
      out.push({
        kind: "nearby",
        hubIata: C,
        layoverMin: Math.round(lay),
        ground: { fromIata: C, toIata: D, distKm: Math.round(dist), estMin: Math.round(estGroundMin(dist)) },
        legs: [toLeg(origin, C, a, [null, a.peerName]), toLeg(D, dest, b, [b.peerName, null])],
      });
    }
  }

  // direct first, then everything by layover ascending
  out.sort((x, y) => {
    const dx = x.kind === "direct" ? 0 : 1;
    const dy = y.kind === "direct" ? 0 : 1;
    return dx - dy || (x.layoverMin ?? 0) - (y.layoverMin ?? 0);
  });
  return out.slice(0, 100);
}
