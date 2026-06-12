-- DropTable (replaced by per-token quota)
DROP TABLE IF EXISTS "api_quota";

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "unitsLimit" INTEGER NOT NULL DEFAULT 0,
    "unitsRemaining" INTEGER NOT NULL DEFAULT 0,
    "requestsLimit" INTEGER NOT NULL DEFAULT 0,
    "requestsRemaining" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);
