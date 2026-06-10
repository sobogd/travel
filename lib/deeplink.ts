// Google Flights deep link — one-way, exact date. Optional airline + nonstop
// are honoured via the natural-language query (exact times are NOT — Google
// ignores them in q=). Universal for any carrier.
export function googleFlights(
  origin: string,
  dest: string,
  date: string,
  opts?: { airline?: string | null; nonstop?: boolean },
): string {
  const air = opts?.airline ? `${opts.airline} ` : "";
  const stop = opts?.nonstop ? " nonstop" : "";
  const q = `${air}One way flights from ${origin} to ${dest} on ${date}${stop}`;
  return `https://www.google.com/travel/flights?hl=ru&curr=EUR&q=${encodeURIComponent(q)}`;
}

// YYYY-MM-DD out of a local datetime string like "2026-06-25 06:40+02:00".
export function dateOf(local: string | null): string {
  const m = (local || "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
