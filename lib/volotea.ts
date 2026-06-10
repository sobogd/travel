import type { DayFare } from "./types";

// Volotea publishes a static per-route schedule JSON — public, no auth, cached
// ~30 min. One file holds the whole forward schedule (several months) with real
// flight times + fares. We reduce it to one cheapest DayFare per date in range.
//
// URL:   https://json.volotea.com/dist/schedule/{ORIGIN}-{DEST}_schedule.json
// Shape: { "OVD-VLC": [ { Departure: "YYYYMMDDHHMM", Arrival, FlightNumber,
//          Prices: [{ Price, PriceWithFee, FareType, FareBasis, Currency }],
//          CarrierCode: "V7", ... } ] }

const BASE = "https://json.volotea.com/dist/schedule";

type VoloteaFare = { Price?: number; Currency?: string };
type VoloteaFlight = { Departure?: string; Prices?: VoloteaFare[] };

export async function voloteaSchedule(
  origin: string,
  dest: string,
  dateFrom: string,
  dateTo: string,
  currency = "EUR",
): Promise<DayFare[]> {
  const key = `${origin}-${dest}`;
  const url = `${BASE}/${encodeURIComponent(key)}_schedule.json`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return []; // no Volotea route
  if (!res.ok) throw new Error(`Volotea API ${res.status}`);

  const data = await res.json();
  const flights: VoloteaFlight[] = data?.[key] ?? [];

  // group by departure date, keep the cheapest fare of the day
  const byDay = new Map<string, { price: number; currency: string }>();
  for (const f of flights) {
    const dep = String(f.Departure ?? "");
    if (dep.length < 8) continue;
    const date = `${dep.slice(0, 4)}-${dep.slice(4, 6)}-${dep.slice(6, 8)}`;
    if (date < dateFrom || date > dateTo) continue;
    const prices = (f.Prices ?? [])
      .map((p) => p.Price)
      .filter((n): n is number => typeof n === "number");
    if (prices.length === 0) continue;
    const min = Math.min(...prices);
    const cur = byDay.get(date);
    if (!cur || min < cur.price) {
      byDay.set(date, { price: min, currency: f.Prices?.[0]?.Currency ?? currency });
    }
  }

  return [...byDay.entries()].map(([date, v]) => ({
    date,
    available: true,
    price: v.price,
    currency: v.currency,
    carrier: "V7",
  }));
}
