/**
 * Applies runtime schema patches (missing columns/tables) before workers start.
 * Safe to run on every deploy — idempotent.
 */
import { ensureDbSchema } from "../src/lib/prisma";

await ensureDbSchema();
console.log("Database schema ensure complete");
