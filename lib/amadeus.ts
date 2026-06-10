import type { DayFare } from "./types";

// Amadeus Self-Service API — legitimate GDS access covering ~400 airlines,
// including the ones we can't scrape (Iberia/Vueling/IAG, legacy carriers).
// Used as a fallback/complement to the per-airline scrapers. No-op unless
// AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET are set.
//
// Per day we run Flight Offers Search (nonStop, cheapest) so we also learn the
// operating airline. Calls are batched to respect the test-env rate limit.

const BASE = process.env.AMADEUS_BASE || "https://test.api.amadeus.com";
const BATCH = 5;

let token: { value: string; exp: number } | null = null;

function configured(): boolean {
  return !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const res = await fetch(`${BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_CLIENT_ID!,
      client_secret: process.env.AMADEUS_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Amadeus auth ${res.status}`);
  const data = await res.json();
  token = {
    value: data.access_token,
    exp: Date.now() + (data.expires_in ?? 1800) * 1000,
  };
  return token.value;
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Cheapest nonstop offer for one date, or null. Returns price + carrier code.
async function offerForDate(
  tk: string,
  origin: string,
  dest: string,
  date: string,
  currency: string,
): Promise<{ price: number; carrier: string | null } | null> {
  const url =
    `${BASE}/v2/shopping/flight-offers?originLocationCode=${origin}` +
    `&destinationLocationCode=${dest}&departureDate=${date}&adults=1` +
    `&nonStop=true&currencyCode=${currency}&max=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tk}` },
    cache: "no-store",
  });
  if (res.status === 400) return null; // no route/date
  if (!res.ok) throw new Error(`Amadeus offers ${res.status}`);
  const data = await res.json();
  const offer = data?.data?.[0];
  if (!offer) return null;
  const price = Number(offer.price?.grandTotal ?? offer.price?.total);
  if (!isFinite(price)) return null;
  const carrier =
    offer.validatingAirlineCodes?.[0] ??
    offer.itineraries?.[0]?.segments?.[0]?.carrierCode ??
    null;
  return { price, carrier };
}

export async function amadeusSchedule(
  origin: string,
  dest: string,
  dateFrom: string,
  dateTo: string,
  currency = "EUR",
): Promise<DayFare[]> {
  if (!configured()) return [];
  const tk = await getToken();
  const dates = enumerateDates(dateFrom, dateTo);
  const out: DayFare[] = [];

  for (let i = 0; i < dates.length; i += BATCH) {
    const slice = dates.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      slice.map((d) => offerForDate(tk, origin, dest, d, currency)),
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled" && r.value) {
        out.push({
          date: slice[j],
          available: true,
          price: r.value.price,
          currency,
          carrier: r.value.carrier,
        });
      }
    });
  }
  return out;
}
