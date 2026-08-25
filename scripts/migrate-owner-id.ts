/**
 * Pre-migration: add nullable ownerId columns and backfill to admin
 * BEFORE `prisma db push` requires NOT NULL ownerId (would fail on existing rows).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("[migrate-owner] Preparing ownerId columns…");

  // Ensure admin exists for backfill target
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Admin";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
  `);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, role: "ADMIN", isActive: true },
    create: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  const adminId = admin.id;
  console.log(`[migrate-owner] Admin for backfill: ${admin.email} (${adminId})`);

  const tables = [
    "SendingDomain",
    "EmailAccount",
    "Contact",
    "Lead",
    "Template",
    "Campaign",
    "SuppressionList",
    "BounceEvent",
  ] as const;

  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;`,
    );
  }

  for (const table of tables) {
    if (table === "BounceEvent") {
      await prisma.$executeRawUnsafe(
        `UPDATE "BounceEvent" SET "ownerId" = $1 WHERE "ownerId" IS NULL`,
        adminId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "ownerId" = $1 WHERE "ownerId" IS NULL`,
        adminId,
      );
    }
  }

  // Inherit bounce owner from mailbox when possible
  await prisma.$executeRawUnsafe(`
    UPDATE "BounceEvent" b
    SET "ownerId" = e."ownerId"
    FROM "EmailAccount" e
    WHERE b."inboxId" = e.id
      AND e."ownerId" IS NOT NULL
      AND (b."ownerId" IS NULL OR b."ownerId" = '');
  `);

  // Drop old global uniques that block per-owner uniques
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_email_key";`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_phone_key";`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Template" DROP CONSTRAINT IF EXISTS "Template_name_language_channel_key";`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SuppressionList" DROP CONSTRAINT IF EXISTS "SuppressionList_email_key";`,
  );

  // Drop unique indexes by name if they exist as indexes not constraints
  for (const idx of [
    "Contact_email_key",
    "Contact_phone_key",
    "Template_name_language_channel_key",
    "SuppressionList_email_key",
  ]) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${idx}";`);
  }

  console.log("[migrate-owner] ownerId backfill complete");
}

main()
  .catch((e) => {
    console.error("[migrate-owner] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
