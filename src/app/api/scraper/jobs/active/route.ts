import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getActiveScrapeJob } from "@/lib/scraper";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const res = await getActiveScrapeJob();
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { active: false, job: null, error: e instanceof Error ? e.message : "Failed to fetch active job" },
      { status: 500 },
    );
  }
}
