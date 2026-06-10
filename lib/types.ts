export type Airport = {
  code: string;
  name: string;
  city: string | null;
  country: string;
  lat: number | null;
  lon: number | null;
};

// One day of a route's cheapest-fare scan. available=false => no direct flight.
// carrier = IATA code of the airline with the cheapest fare that day.
export type DayFare = {
  date: string; // YYYY-MM-DD
  available: boolean;
  price: number | null;
  currency: string;
  carrier?: string | null; // "FR" Ryanair | "V7" Volotea
};

export const carrierName = (code?: string | null) =>
  code === "FR" ? "Ryanair" : code === "V7" ? "Volotea" : code || "";

export type SearchResult = {
  id: string;
  originCode: string;
  destCode: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  days: DayFare[];
  createdAt: string;
};

export const airportLabel = (a?: Airport | null) =>
  a ? `${a.code} · ${a.city || a.name}` : "";
