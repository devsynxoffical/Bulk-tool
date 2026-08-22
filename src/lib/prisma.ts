import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient() {
  const existing = globalForPrisma.prisma;

  if (
    existing &&
    typeof (existing as unknown as { emailAccount?: unknown }).emailAccount !==
      "undefined"
  ) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();

let isEnsured = false;

/**
 * Self-healing runtime schema synchronizer.
 * Ensures PostgreSQL tables (SendingDomain, SuppressionList) and columns
 * exist in the remote database even if Railway bypasses 'prisma db push'.
 */
export async function ensureDbSchema() {
  if (isEnsured) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SendingDomain" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "domainName" TEXT NOT NULL UNIQUE,
        "dkimPrivateKey" TEXT,
        "dkimPublicKey" TEXT,
        "dkimSelector" TEXT NOT NULL DEFAULT 'dkim',
        "spfVerified" BOOLEAN NOT NULL DEFAULT false,
        "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
        "dmarcVerified" BOOLEAN NOT NULL DEFAULT false,
        "mxVerified" BOOLEAN NOT NULL DEFAULT false,
        "isVerified" BOOLEAN NOT NULL DEFAULT false,
        "dailyLimit" INTEGER NOT NULL DEFAULT 1000,
        "sentToday" INTEGER NOT NULL DEFAULT 0,
        "lastSentAt" TIMESTAMP(3),
        "spfRecordHint" TEXT,
        "lastCheckedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SuppressionList" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "reason" TEXT NOT NULL DEFAULT 'UNSUBSCRIBED',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "domainId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 250;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "sentToday" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 100;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupStartedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupEnabled" BOOLEAN NOT NULL DEFAULT true;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupStage" INTEGER NOT NULL DEFAULT 1;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "bounceCount" INTEGER NOT NULL DEFAULT 0;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 1000;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "sentToday" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "spfRecordHint" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BounceEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "inboxId" TEXT,
        "contactId" TEXT,
        "reason" TEXT NOT NULL DEFAULT 'HARD_BOUNCE',
        "raw" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "emailOptedOut" BOOLEAN NOT NULL DEFAULT false;
    `);

    isEnsured = true;
  } catch (err) {
    console.error("Auto-schema sync warning:", err);
  }
}
