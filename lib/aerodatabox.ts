import { prisma } from "./prisma";

// AeroDataBox FIDS (airport flight schedules) — one source covering every
// airline (Iberia/Vueling/Volotea/…). The API caps each call at a 12h window,
// so we cache per (airport, direction, date, half) in Postgres. BASIC plan also
// rate-limits ~1 req/1.5s, hence the throttle.

const HOST = "aerodatabox.p.rapidapi.com";

// Persist the rate-limit snapshot from RapidAPI response headers. The *-reset
// header is seconds remaining until the window rolls over, so resetAt is a
// wall-clock timestamp. Best-effort: never let quota bookkeeping break a search.
async function recordQuota(h: Headers): Promise<void> {
  const num = (name: string) => {
    const v = h.get(name);
    return v == null ? null : Number(v);
  };
  const unitsLimit = num("x-ratelimit-api-units-limit");
  const unitsRemaining = num("x-ratelimit-api-units-remaining");
  const requestsLimit = num("x-ratelimit-requests-limit");
  const requestsRemaining = num("x-ratelimit-requests-remaining");
  const resetSec = num("x-ratelimit-api-units-reset");
  if (unitsLimit == null || unitsRemaining == null || resetSec == null) return;
  const data = {
    unitsLimit,
    unitsRemaining,
    requestsLimit: requestsLimit ?? 0,
    requestsRemaining: requestsRemaining ?? 0,
    resetAt: new Date(Date.now() + resetSec * 1000),
  };
  try {
    await prisma.apiQuota.upsert({
      where: { provider: "aerodatabox" },
      create: { provider: "aerodatabox", ...data },
      update: data,
    });
  } catch {
    /* ignore — telemetry must not break the request */
  }
}

export type ParsedFlight = {
  peerIata: string | null; // the OTHER airport (dest for Dep, origin for Arr)
  peerName: string | null;
  depUtc: string | null; // flight departure (from its origin)
  depLocal: string | null;
  arrUtc: string | null; // flight arrival (at its dest)
  arrLocal: string | null;
  airlineIata: string | null;
  airlineName: string | null;
  flightNo: string | null;
};

export type Direction = "Departure" | "Arrival";
export type Half = "AM" | "PM";

// ---- throttle: serialize calls, >=1.6s apart ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, 1600 - (Date.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = Date.now();
    return fn();
  };
  const p = chain.then(run, run) as Promise<T>;
  chain = p.catch(() => {});
  return p;
}

function freshFor(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const days = (Date.parse(date) - Date.parse(today)) / 86400000;
  return days > 3 ? 14 * 86400000 : 6 * 3600000; // 14d future / 6h near
}

function parse(json: unknown, direction: Direction): ParsedFlight[] {
  const list =
    (direction === "Departure"
      ? (json as { departures?: unknown[] }).departures
      : (json as { arrivals?: unknown[] }).arrivals) ?? [];
  const out: ParsedFlight[] = [];
  for (const f of list as Array<Record<string, unknown>>) {
    // drop only explicit codeshare duplicates; keep operating + unclassified
    // ("Unknown") — most real flights come back as "Unknown".
    if (f.codeshareStatus === "IsCodeshared") continue;
    const dep = f.departure as
      | { airport?: { iata?: string; name?: string }; scheduledTime?: { utc?: string; local?: string } }
      | undefined;
    const arr = f.arrival as
      | { airport?: { iata?: string; name?: string }; scheduledTime?: { utc?: string; local?: string } }
      | undefined;
    const airline = f.airline as { iata?: string; name?: string } | undefined;
    // peer = the airport that ISN'T the one we queried (queried side omits airport)
    const peer = direction === "Departure" ? arr?.airport : dep?.airport;
    out.push({
      peerIata: peer?.iata ?? null,
      peerName: peer?.name ?? null,
      depUtc: dep?.scheduledTime?.utc ?? null,
      depLocal: dep?.scheduledTime?.local ?? null,
      arrUtc: arr?.scheduledTime?.utc ?? null,
      arrLocal: arr?.scheduledTime?.local ?? null,
      airlineIata: airline?.iata ?? null,
      airlineName: airline?.name ?? null,
      flightNo: (f.number as string) ?? null,
    });
  }
  return out;
}

async function fetchFids(
  airportCode: string,
  direction: Direction,
  date: string,
  half: Half,
): Promise<ParsedFlight[]> {
  const key = process.env.AERODATABOX_KEY;
  if (!key) throw new Error("AERODATABOX_KEY not set");
  const from = half === "AM" ? `${date}T00:00` : `${date}T12:00`;
  const to = half === "AM" ? `${date}T12:00` : `${date}T23:59`;
  const url =
    `https://${HOST}/flights/airports/iata/${airportCode}/${from}/${to}` +
    `?direction=${direction}&withLeg=true&withCancelled=false&withCodeshared=true`;
  const res = await throttle(() =>
    fetch(url, { headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key } }),
  );
  await recordQuota(res.headers); // refresh quota snapshot (even on 429)
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`AeroDataBox ${res.status}`);
  return parse(await res.json(), direction);
}

// Cached FIDS for one (airport, direction, date, half). Hits DB first.
export async function getFids(
  airportCode: string,
  direction: Direction,
  date: string,
  half: Half,
): Promise<ParsedFlight[]> {
  const where = { airportCode_direction_date_half: { airportCode, direction, date, half } };
  const cached = await prisma.fidsCache.findUnique({ where });
  if (cached && Date.now() - cached.fetchedAt.getTime() < freshFor(date)) {
    return cached.flights as unknown as ParsedFlight[];
  }
  const flights = await fetchFids(airportCode, direction, date, half);
  await prisma.fidsCache.upsert({
    where,
    create: { airportCode, direction, date, half, flights: flights as object },
    update: { flights: flights as object, fetchedAt: new Date() },
  });
  return flights;
}
