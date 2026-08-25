import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerScope, requireSession } from "@/lib/api";
import { checkScraperHealth, startScrape } from "@/lib/scraper";

const schema = z.object({
  query: z.string().min(3).max(200),
  source: z.enum(["maps", "google", "bing", "all"]).default("all"),
  maxLeads: z.number().int().min(10).max(1000).default(300),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);

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
    const exclusions = await fetchScrapeExclusionsFromDb(scope.ownerId);
    const { jobId } = await startScrape({
      ...parsed.data,
      skipEmails: exclusions.emails,
      skipDomains: exclusions.domains,
    });
    return NextResponse.json({ jobId, skippedKnown: exclusions.counts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start scrape" },
      { status: 502 },
    );
  }
}

async function fetchScrapeExclusionsFromDb(ownerId?: string) {
  const { prisma } = await import("@/lib/prisma");
  const ownerFilter = ownerId ? { ownerId } : {};

  function domainFromUrl(raw: string | null | undefined): string {
    if (!raw) return "";
    try {
      const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
      return host.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  const [contacts, leads, suppressed] = await Promise.all([
    prisma.contact.findMany({
      where: { email: { not: null }, ...ownerFilter },
      select: { email: true, customFields: true },
      take: 50_000,
    }),
    prisma.lead.findMany({
      where: {
        ...ownerFilter,
        OR: [{ email: { not: null } }, { website: { not: null } }],
      },
      select: { email: true, website: true },
      take: 50_000,
    }),
    prisma.suppressionList.findMany({
      where: { ...ownerFilter },
      select: { email: true },
      take: 20_000,
    }),
  ]);

  const emails = new Set<string>();
  const domains = new Set<string>();

  for (const row of contacts) {
    if (row.email) emails.add(row.email.toLowerCase());
    const cf = row.customFields as { website?: string } | null;
    const d = domainFromUrl(cf?.website);
    if (d) domains.add(d);
  }
  for (const row of leads) {
    if (row.email) emails.add(row.email.toLowerCase());
    const d = domainFromUrl(row.website);
    if (d) domains.add(d);
  }
  for (const row of suppressed) {
    emails.add(row.email.toLowerCase());
  }

  return {
    emails: Array.from(emails),
    domains: Array.from(domains),
    counts: { emails: emails.size, domains: domains.size },
  };
}
