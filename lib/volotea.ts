import { chromium, type Browser, type BrowserContext } from "playwright";
import type { DayFare } from "./types";

// Volotea's fresh fare data lives behind their `getminprice` API, which sits
// behind an Imperva/Incapsula bot wall — plain fetch gets 401. The static
// per-route schedule JSONs (json.volotea.com) have no wall but Volotea lets some
// of them go stale (e.g. OVD-BGY frozen at 2024). So we drive a real headless
// browser ONCE to clear Imperva + grab an anonymous session, keep that context
// warm, and call getminprice through it (~1-2s/route once warm).

const GETMINPRICE = "https://api.volotea.com/voe/price/v1/Cache/getminprice";
const APP_ID = "09c45c37";
const API_KEY = "d0b1a5564d0f7d37baee678ea5-vocms";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let warming: Promise<BrowserContext> | null = null;

// Free RAM when idle: close the browser after this long with no queries.
const IDLE_MS = 5 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function bumpIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => shutdown(), IDLE_MS);
  // don't keep the node process alive just for this timer
  if (typeof idleTimer === "object" && "unref" in idleTimer) idleTimer.unref();
}

async function shutdown() {
  const b = browser;
  context = null;
  warming = null;
  browser = null;
  await b?.close().catch(() => {});
}

// Launch a browser and pass the Imperva JS challenge by loading the site once.
async function warm(): Promise<BrowserContext> {
  if (!browser) browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto("https://www.volotea.com/en/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3500); // let Imperva clear + anonymous login run
  await page.click("#onetrust-accept-btn-handler").catch(() => {});
  await page.waitForTimeout(800);
  await page.close();
  return ctx;
}

async function getContext(): Promise<BrowserContext> {
  if (context) return context;
  if (!warming) warming = warm().then((c) => (context = c));
  return warming;
}

function resetContext() {
  const old = context;
  context = null;
  warming = null;
  old?.close().catch(() => {});
}

type MinPriceEntry = {
  Market?: string;
  Price?: number;
  DepartureFlightDate?: string; // "YYYY-MM-DD"
  ConnectionInformation?: unknown[];
};

async function callGetMinPrice(
  ctx: BrowserContext,
  market: string,
  startDate: string,
  endDate: string,
): Promise<MinPriceEntry[]> {
  const body = {
    AppId: APP_ID,
    AppKey: API_KEY,
    RestRequest: {
      Url: "markets",
      Content: [
        {
          AnyPeriod: true,
          MarketType: "SSS-*",
          MarketValue: market,
          PriceWithFee: true,
          RepeatMarkets: true,
          IsWeekend: false,
          EndDate: endDate,
          FareType: "R",
          MaxResults: "300",
          StartDate: startDate,
        },
      ],
    },
  };
  const res = await ctx.request.post(GETMINPRICE, {
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      referer: "https://www.volotea.com/",
      origin: "https://www.volotea.com",
    },
    data: body,
    timeout: 20000,
  });
  if (res.status() === 401) throw new Error("401");
  if (!res.ok()) throw new Error(`getminprice ${res.status()}`);
  const data = await res.json();
  return data?.Content?.[0]?.Value ?? [];
}

// Public API — same shape as the other carriers. Returns one cheapest DIRECT
// DayFare per date in range (carrier V7). Empty when Volotea has no direct route.
export async function voloteaSchedule(
  origin: string,
  dest: string,
  dateFrom: string,
  dateTo: string,
  currency = "EUR",
): Promise<DayFare[]> {
  const market = `${origin}-${dest}`;
  // EndDate is exclusive in their calendar; nudge a day past dateTo.
  const end = new Date(dateTo + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);
  const endDate = end.toISOString().slice(0, 10);

  let entries: MinPriceEntry[];
  try {
    const ctx = await getContext();
    entries = await callGetMinPrice(ctx, market, dateFrom, endDate);
  } catch (e) {
    // session likely stale → re-warm once and retry
    if (e instanceof Error && /401/.test(e.message)) {
      resetContext();
      const ctx = await getContext();
      entries = await callGetMinPrice(ctx, market, dateFrom, endDate);
    } else {
      throw e;
    }
  }
  bumpIdle(); // a query happened → push back the idle shutdown

  // keep only this market, direct flights, within range; cheapest per day
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.Market !== market) continue;
    if ((e.ConnectionInformation?.length ?? 0) > 0) continue; // direct only
    const date = e.DepartureFlightDate;
    if (!date || date < dateFrom || date > dateTo) continue;
    const price = typeof e.Price === "number" ? e.Price : null;
    if (price == null) continue;
    const cur = byDay.get(date);
    if (cur == null || price < cur) byDay.set(date, price);
  }

  return [...byDay.entries()].map(([date, price]) => ({
    date,
    available: true,
    price,
    currency,
    carrier: "V7",
  }));
}
