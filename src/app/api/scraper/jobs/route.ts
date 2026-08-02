import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { checkScraperHealth, startScrape } from "@/lib/scraper";

const schema = z.object({
  query: z.string().min(3).max(200),
  includeEmails: z.boolean().default(true),
  maxLeads: z.number().int().min(10).max(1000).default(300),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a search like “dentists in Lahore” (at least 3 characters)." },
      { status: 400 },
    );
  }

  const healthy = await checkScraperHealth();
  if (!healthy) {
    return NextResponse.json(
      {
        error:
          "Lead scraper service is offline. Start it in a separate terminal with: npm run scraper",
      },
      { status: 503 },
    );
  }

  try {
    const { jobId } = await startScrape(parsed.data);
    return NextResponse.json({ jobId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start scrape" },
      { status: 502 },
    );
  }
}
