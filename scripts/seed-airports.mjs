// Seed the Airport table from OurAirports (public domain). Keeps only airports
// that have an IATA code and are large/medium or have scheduled service — the
// ones an airline like Ryanair actually uses. Run: npm run seed:airports
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

// Minimal CSV row parser (handles quoted fields with commas / escaped quotes).
function parseRow(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  console.log("Downloading OurAirports CSV…");
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  const header = parseRow(lines[0]);
  const idx = (name) => header.indexOf(name);
  const iName = idx("name");
  const iLat = idx("latitude_deg");
  const iLon = idx("longitude_deg");
  const iCountry = idx("iso_country");
  const iMun = idx("municipality");
  const iSched = idx("scheduled_service");
  const iIcao = idx("icao_code");
  const iIata = idx("iata_code");

  const rows = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const r = parseRow(lines[i]);
    const iata = (r[iIata] || "").trim().toUpperCase();
    if (!iata || iata.length !== 3) continue;
    const sched = r[iSched] || "";
    // Keep only airports with scheduled airline service — drops medium/GA fields
    // that carry an IATA code but no regular flights (unreachable hubs).
    const keep = sched === "yes";
    if (!keep) continue;
    if (seen.has(iata)) continue;
    seen.add(iata);
    rows.push({
      code: iata,
      icao: (r[iIcao] || "").trim() || null,
      name: r[iName] || iata,
      city: (r[iMun] || "").trim() || null,
      country: (r[iCountry] || "").trim().toUpperCase(),
      lat: r[iLat] ? Number(r[iLat]) : null,
      lon: r[iLon] ? Number(r[iLon]) : null,
    });
  }

  console.log(`Parsed ${rows.length} airports with IATA codes. Seeding…`);
  await prisma.airport.deleteMany();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.airport.createMany({
      data: rows.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log(`\nDone. ${rows.length} airports seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
