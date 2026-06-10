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

const CARRIERS: Record<string, string> = {
  FR: "Ryanair",
  V7: "Volotea",
  IB: "Iberia",
  VY: "Vueling",
  I2: "Iberia Express",
  UX: "Air Europa",
  U2: "easyJet",
  W6: "Wizz Air",
  HV: "Transavia",
  BA: "British Airways",
  AF: "Air France",
  KL: "KLM",
  LH: "Lufthansa",
  DY: "Norwegian",
};

export const carrierName = (code?: string | null) =>
  (code && CARRIERS[code]) || code || "";

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

// OurAirports municipality sometimes carries an Italian province suffix like
// "Orio al Serio (BG)" — the "(BG)" reads as Bulgaria. Strip it for display.
export const cleanCity = (c?: string | null) =>
  (c || "").replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();

export const airportLabel = (a?: Airport | null) =>
  a ? `${a.code} · ${cleanCity(a.city) || a.name}` : "";
