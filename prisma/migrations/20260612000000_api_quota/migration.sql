-- CreateTable
CREATE TABLE "api_quota" (
    "provider" TEXT NOT NULL,
    "unitsLimit" INTEGER NOT NULL,
    "unitsRemaining" INTEGER NOT NULL,
    "requestsLimit" INTEGER NOT NULL,
    "requestsRemaining" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_quota_pkey" PRIMARY KEY ("provider")
);
