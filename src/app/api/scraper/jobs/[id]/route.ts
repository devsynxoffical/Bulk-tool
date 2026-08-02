import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getScrapeJob } from "@/lib/scraper";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  try {
    const job = await getScrapeJob(id);
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Job not found" },
      { status: 404 },
    );
  }
}
