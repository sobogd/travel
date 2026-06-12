// One-time migration of the AERODATABOX_KEY env secret into the api_tokens
// table. Idempotent: does nothing once at least one token exists, so it is safe
// to run on every deploy. After the first successful run the env secret can be
// removed — tokens live in the DB and are managed from the admin page.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.apiToken.count();
  if (count > 0) {
    console.log(`[seed-token] ${count} token(s) already present — skip.`);
    return;
  }
  const key = process.env.AERODATABOX_KEY;
  if (!key) {
    console.log("[seed-token] no AERODATABOX_KEY in env and table empty — nothing to seed.");
    return;
  }
  await prisma.apiToken.create({
    data: { label: "env (seeded)", key, enabled: true },
  });
  console.log("[seed-token] seeded AERODATABOX_KEY into api_tokens.");
}

main()
  .catch((e) => {
    console.error("[seed-token] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
