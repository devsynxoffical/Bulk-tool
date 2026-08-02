import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { checkScraperHealth } from "@/lib/scraper";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const ok = await checkScraperHealth();
  return NextResponse.json({ ok });
}
