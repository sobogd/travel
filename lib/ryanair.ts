import type { DayFare } from "./types";

// Ryanair `cheapestPerDay` — public, no auth, no key. Returns the cheapest
// one-way fare per day for a route over a date range. A day marked unavailable
// / sold-out / with no price means no direct Ryanair flight that day.
//
// Shape: { outbound: { fares: [{ day, price: { value, currencyCode },
//          soldOut, unavailable }], minFare, maxFare } }

const BASE = "https://www.ryanair.com/api/farfnd/3/oneWayFares";

type RyanairFare = {
  day?: string;
  unavailable?: boolean;
  soldOut?: boolean;
  price?: { value?: number; currencyCode?: string } | null;
};

export async function ryanairCheapestPerDay(
  origin: string,
  dest: string,
  dateFrom: string,
  dateTo: string,
  currency = "EUR",
): Promise<DayFare[]> {
  const url =
    `${BASE}/${encodeURIComponent(origin)}/${encodeURIComponent(dest)}/cheapestPerDay` +
    `?outboundDateFrom=${dateFrom}&outboundDateTo=${dateTo}&currency=${currency}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Ryanair API ${res.status}`);
  const data = await res.json();
  const fares: RyanairFare[] = data?.outbound?.fares ?? [];

  return fares.map((f) => {
    const value = f.price?.value;
    return {
      date: (f.day ?? "").slice(0, 10),
      available: !f.unavailable && !f.soldOut && value != null,
      price: value ?? null,
      currency: f.price?.currencyCode ?? currency,
      carrier: "FR",
    };
  });
}
