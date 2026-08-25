import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope, requireSession } from "@/lib/api";

function domainFromUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Known emails + domains already saved — scraper skips these. */
export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);

  const [contacts, leads, suppressed] = await Promise.all([
    prisma.contact.findMany({
      where: { email: { not: null }, ...scope },
      select: { email: true, customFields: true },
      take: 50_000,
    }),
    prisma.lead.findMany({
      where: {
        ...scope,
        OR: [{ email: { not: null } }, { website: { not: null } }],
      },
      select: { email: true, website: true },
      take: 50_000,
    }),
    prisma.suppressionList.findMany({
      where: { ...scope },
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

  return NextResponse.json({
    emails: Array.from(emails),
    domains: Array.from(domains),
    counts: { emails: emails.size, domains: domains.size },
  });
}
