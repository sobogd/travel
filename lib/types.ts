export type Airport = {
  code: string;
  name: string;
  city: string | null;
  country: string;
  lat: number | null;
  lon: number | null;
};

// One day of a route's cheapest-fare scan. available=false => no direct flight.
export type DayFare = {
  date: string; // YYYY-MM-DD
  available: boolean;
  price: number | null;
  currency: string;
};

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
