-- CreateTable
CREATE TABLE "airports" (
    "code" TEXT NOT NULL,
    "icao" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "searches" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT,
    "originCode" TEXT NOT NULL,
    "destCode" TEXT NOT NULL,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "airports_country_idx" ON "airports"("country");

-- CreateIndex
CREATE INDEX "searches_ownerKey_idx" ON "searches"("ownerKey");
