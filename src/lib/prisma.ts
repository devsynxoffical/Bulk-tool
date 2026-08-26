import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbSchemaEnsured?: boolean;
  dbSchemaEnsurePromise?: Promise<void>;
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
  // Cache in all envs — recreating PrismaClient is expensive
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();

/**
 * Self-healing runtime schema sync.
 * Fast-path: if ownerId already exists (normal after migrate-owner-id), return immediately.
 * Full ALTER/CREATE path only runs once per process when the probe fails.
 */
export async function ensureDbSchema() {
  if (globalForPrisma.dbSchemaEnsured) return;
  if (globalForPrisma.dbSchemaEnsurePromise) {
    return globalForPrisma.dbSchemaEnsurePromise;
  }

  globalForPrisma.dbSchemaEnsurePromise = (async () => {
    try {
      await prisma.$queryRawUnsafe(
        `SELECT "ownerId" FROM "EmailAccount" WHERE false`,
      );
      globalForPrisma.dbSchemaEnsured = true;
      return;
    } catch {
      // Schema incomplete — run full ensure below
    }

    try {
      await runFullSchemaEnsure();
      globalForPrisma.dbSchemaEnsured = true;
    } catch (err) {
      console.error("Auto-schema sync warning:", err);
    }
  })();

  try {
    await globalForPrisma.dbSchemaEnsurePromise;
  } finally {
    globalForPrisma.dbSchemaEnsurePromise = undefined;
  }
}

async function runFullSchemaEnsure() {
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

  const emailAccountCols = [
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "domainId" TEXT`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 250`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "sentToday" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3)`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupStartedAt" TIMESTAMP(3)`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupEnabled" BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "warmupStage" INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "bounceCount" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "lastInboxPollUid" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "lastInboxSyncAt" TIMESTAMP(3)`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "inboxSyncError" TEXT`,
    `ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  ];
  for (const sql of emailAccountCols) {
    await prisma.$executeRawUnsafe(sql);
  }

  for (const sql of [
    `ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "sentToday" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "lastSentAt" TIMESTAMP(3)`,
    `ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "spfRecordHint" TEXT`,
    `ALTER TABLE "SendingDomain" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  ]) {
    await prisma.$executeRawUnsafe(sql);
  }

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

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "emailOptedOut" BOOLEAN NOT NULL DEFAULT false`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SuppressionList" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "BounceEvent" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true`,
  );

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "inboxId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Message_inboxId_idx" ON "Message"("inboxId")`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "CampaignRecipient" ADD COLUMN IF NOT EXISTS "inboxId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CampaignRecipient_inboxId_idx" ON "CampaignRecipient"("inboxId")`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InboundEmail" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "inboxId" TEXT NOT NULL,
      "imapUid" INTEGER NOT NULL,
      "messageId" TEXT,
      "fromEmail" TEXT NOT NULL,
      "fromName" TEXT,
      "toEmail" TEXT NOT NULL,
      "subject" TEXT,
      "bodyText" TEXT,
      "bodyHtml" TEXT,
      "isRead" BOOLEAN NOT NULL DEFAULT false,
      "isBounce" BOOLEAN NOT NULL DEFAULT false,
      "inReplyTo" TEXT,
      "relatedOutboundId" TEXT,
      "contactId" TEXT,
      "receivedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InboundEmail_inboxId_imapUid_key" UNIQUE ("inboxId", "imapUid")
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InboundEmail_inboxId_receivedAt_idx" ON "InboundEmail"("inboxId", "receivedAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InboundEmail_inboxId_isRead_idx" ON "InboundEmail"("inboxId", "isRead")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InboundEmail_fromEmail_idx" ON "InboundEmail"("fromEmail")`,
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      admin_id TEXT;
    BEGIN
      SELECT id INTO admin_id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1;
      IF admin_id IS NULL THEN
        SELECT id INTO admin_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;
      END IF;
      IF admin_id IS NULL THEN
        RETURN;
      END IF;

      UPDATE "SendingDomain" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "EmailAccount" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "Contact" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "Lead" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "Template" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "Campaign" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "SuppressionList" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
      UPDATE "BounceEvent" SET "ownerId" = admin_id WHERE "ownerId" IS NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_email_key"`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_phone_key"`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Template" DROP CONSTRAINT IF EXISTS "Template_name_language_channel_key"`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SuppressionList" DROP CONSTRAINT IF EXISTS "SuppressionList_email_key"`,
  );

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Contact_ownerId_email_key" ON "Contact"("ownerId", "email")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Contact_ownerId_phone_key" ON "Contact"("ownerId", "phone")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Template_ownerId_name_language_channel_key" ON "Template"("ownerId", "name", "language", "channel")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "SuppressionList_ownerId_email_key" ON "SuppressionList"("ownerId", "email")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "EmailAccount_ownerId_idx" ON "EmailAccount"("ownerId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SendingDomain_ownerId_idx" ON "SendingDomain"("ownerId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Campaign_ownerId_idx" ON "Campaign"("ownerId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Contact_ownerId_idx" ON "Contact"("ownerId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Lead_ownerId_idx" ON "Lead"("ownerId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Template_ownerId_idx" ON "Template"("ownerId")`,
  );
}
