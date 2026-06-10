// Debug airline requests through a real browser (bypasses cookie/anti-bot walls
// that plain fetch hits). Two modes:
//
//   node scripts/probe.mjs <url>
//       Open <url> in chromium and print HTTP status + response body. Use for
//       hitting a JSON endpoint directly with real browser headers/cookies.
//
//   node scripts/probe.mjs <pageUrl> --net [substr]
//       Open a booking page, let it run, and print every JSON XHR/fetch the page
//       makes (URL + status). Add [substr] to also dump bodies of matching URLs.
//       Use to DISCOVER an airline's hidden endpoints.
//
// Flags: --head (headed browser), --wait <ms> (extra settle time).
import { chromium } from "playwright";

const args = process.argv.slice(2);
const url = args[0];
if (!url) {
  console.error("usage: node scripts/probe.mjs <url> [--net [substr]] [--head] [--wait ms]");
  process.exit(1);
}
const net = args.includes("--net");
const netFilter = net ? args[args.indexOf("--net") + 1] : undefined;
const headed = args.includes("--head");
const waitMs = args.includes("--wait") ? Number(args[args.indexOf("--wait") + 1]) : 3000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const browser = await chromium.launch({ headless: !headed });
const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
const page = await ctx.newPage();

if (net) {
  const seen = [];
  page.on("response", async (res) => {
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (!ct.includes("json")) return;
    const u = res.url();
    seen.push({ u, status: res.status() });
    console.log(`[${res.status()}] ${u}`);
    if (netFilter && u.includes(netFilter)) {
      try {
        const body = await res.text();
        console.log("---- body ----\n" + body.slice(0, 2000) + "\n--------------");
      } catch {}
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.error("goto:", e.message));
  await page.waitForTimeout(waitMs);
  console.log(`\n${seen.length} JSON responses captured.`);
} else {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  console.log("HTTP", resp?.status());
  const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  console.log(body.slice(0, 3000));
}

await browser.close();
