import { prisma } from "./prisma";
import { getFids, type ParsedFlight, type Half } from "./aerodatabox";
import { haversineKm, estGroundMin } from "./geo";

// Connection engine. From A's departures + B's arrivals (the only FIDS we fetch)
// build: direct, via-hub (same airport), via-nearby (land C, ground to D, fly D→B).
// Layover math is in UTC (crosses timezones); the A time window is matched on
// local wall-clock (single timezone at A).

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
  tStartLocal: string; // "YYYY-MM-DDTHH:MM" wall-clock at A
  maxDistKm: number;
  maxLayoverMin: number;
};

// --- time helpers ---
// Wall-clock epoch (ms) treating the local clock as if UTC — only valid for
// comparing times in the SAME timezone (A's window; or one hub C).
function wallMs(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}
const utcMs = (s: string | null) => (s ? Date.parse(s) : null);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

function minLayover(sameAirport: boolean, sameAirline: boolean, groundMin = 0): number {
  if (sameAirport) return sameAirline ? 60 : 120;
  return Math.max(240, groundMin + 60);
}

// Which (date, half) FIDS chunks cover a local window [startMin .. startMin+dur].
function chunksForWindow(date: string, startMin: number, durMin: number): Array<{ date: string; half: Half }> {
  const out: Array<{ date: string; half: Half }> = [];
  const endMin = startMin + durMin;
  for (let dayOff = 0; dayOff <= Math.floor(endMin / 1440); dayOff++) {
    const dayStart = dayOff * 1440;
    const lo = Math.max(startMin, dayStart);
    const hi = Math.min(endMin, dayStart + 1440);
    if (lo >= hi) continue;
    const d = addDays(date, dayOff);
    if (lo < dayStart + 720) out.push({ date: d, half: "AM" });
    if (hi > dayStart + 720) out.push({ date: d, half: "PM" });
  }
  return out;
}

export async function connectSearch(input: ConnectInput): Promise<Itinerary[]> {
  const { origin, dest, tStartLocal, maxDistKm, maxLayoverMin } = input;
  const m = tStartLocal.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) throw new Error("bad tStart");
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const startMin = +m[4] * 60 + +m[5] - 120; // earliest − 2h buffer
  const winStart = startMin;
  const winEnd = startMin + 12 * 60; // 12h window

  // A departures: fetch covering chunks (normalise window start across midnight)
  let baseDate = date;
  let baseMin = winStart;
  while (baseMin < 0) {
    baseDate = addDays(baseDate, -1);
    baseMin += 1440;
  }
  const aChunks = chunksForWindow(baseDate, baseMin, 12 * 60);
  let aDeps: ParsedFlight[] = [];
  for (const c of aChunks) aDeps = aDeps.concat(await getFids(origin, "Departure", c.date, c.half));
  const startAbs = wallMs(`${date}T00:00`)! + winStart * 60000;
  const endAbs = wallMs(`${date}T00:00`)! + winEnd * 60000;
  aDeps = aDeps.filter((f) => {
    const w = wallMs(f.depLocal);
    return w != null && w >= startAbs && w <= endAbs;
  });

  // B arrivals: dates D .. D+extra (extra derived from max layover)
  const extra = Math.min(2, Math.max(1, Math.ceil((maxLayoverMin + 720) / 1440)));
  let bArrs: ParsedFlight[] = [];
  for (let i = 0; i <= extra; i++) {
    const d = addDays(date, i);
    bArrs = bArrs.concat(await getFids(dest, "Arrival", d, "AM"));
    bArrs = bArrs.concat(await getFids(dest, "Arrival", d, "PM"));
  }

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

  // index B arrivals by origin (hub) iata
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

    // 2) HUB — same airport C
    for (const b of byOrigin.get(C) ?? []) {
      const t2 = utcMs(b.depUtc);
      if (t2 == null || t2 < t1) continue;
      const lay = (t2 - t1) / 60000;
      const sameAirline = !!a.airlineIata && a.airlineIata === b.airlineIata;
      if (lay < minLayover(true, sameAirline) || lay > maxLayoverMin) continue;
      out.push({
        kind: "hub",
        hubIata: C,
        layoverMin: Math.round(lay),
        legs: [toLeg(origin, C, a, [null, a.peerName]), toLeg(C, dest, b, [b.peerName, null])],
      });
    }

    // 3) NEARBY — land C, ground to D (≤ R), fly D→B
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
      const ground = estGroundMin(dist);
      if (lay < minLayover(false, false, ground) || lay > maxLayoverMin) continue;
      out.push({
        kind: "nearby",
        hubIata: C,
        layoverMin: Math.round(lay),
        ground: { fromIata: C, toIata: D, distKm: Math.round(dist), estMin: Math.round(ground) },
        legs: [toLeg(origin, C, a, [null, a.peerName]), toLeg(D, dest, b, [b.peerName, null])],
      });
    }
  }

  // rank: direct, then hub, then nearby; within by layover
  const order = { direct: 0, hub: 1, nearby: 2 };
  out.sort((x, y) => order[x.kind] - order[y.kind] || (x.layoverMin ?? 0) - (y.layoverMin ?? 0));
  return out.slice(0, 60);
}
