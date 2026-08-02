import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import { scrapedLeadSchema } from "@/lib/scraper";

const schema = z.object({
  query: z.string().min(1),
  leads: z.array(scrapedLeadSchema).max(1000),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success || parsed.data.leads.length === 0) {
    return NextResponse.json(
      { error: "No leads to import." },
      { status: 400 },
    );
  }

  const { query, leads } = parsed.data;
  const tag = query.trim();
  let saved = 0;
  let imported = 0;

  for (const row of leads) {
    const name = row.Name || null;
    const phoneRaw = row.Phone;
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    const email = row.Email.trim() || null;

    if (phone && phone.length < 8) continue;

    // ── Persist as a lead ──────────────────────────────────────────
    const existingLead = phone
      ? await prisma.lead.findFirst({ where: { name: name ?? undefined, phone } })
      : await prisma.lead.findFirst({ where: { name: name ?? undefined, email } });

    if (existingLead) {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          query: tag,
          email: email ?? existingLead.email,
          website: row.Website || existingLead.website,
          address: row.Address || existingLead.address,
          category: row.Category || existingLead.category,
          rating: toNumber(row.Rating) ?? existingLead.rating,
          reviews: toNumber(row.Reviews) ?? existingLead.reviews,
        },
      });
    } else {
      await prisma.lead.create({
        data: {
          query: tag,
          name: name ?? "Unknown",
          phone,
          email,
          website: row.Website || null,
          address: row.Address || null,
          category: row.Category || null,
          rating: toNumber(row.Rating) ?? null,
          reviews: toNumber(row.Reviews) ?? null,
        },
      });
    }
    saved++;

    // ── Also upsert as a contact so campaigns can target them ─────
    if (!phone && !email) continue;

    const existing = phone
      ? await prisma.contact.findUnique({ where: { phone } })
      : email
        ? await prisma.contact.findUnique({ where: { email } })
        : null;
    const tags = Array.from(
      new Set([...(existing?.tags ?? []), tag, "maps-leads"]),
    );
    const customFields = {
      website: row.Website || null,
      address: row.Address || null,
      category: row.Category || null,
    };

    if (phone) {
      await prisma.contact.upsert({
        where: { phone },
        update: {
          name: name ?? undefined,
          email: email ?? undefined,
          tags,
          customFields,
        },
        create: {
          phone,
          name,
          email,
          tags,
          customFields,
        },
      });
    } else if (email) {
      await prisma.contact.upsert({
        where: { email },
        update: { name: name ?? undefined, tags, customFields },
        create: { email, name, tags, customFields },
      });
    }
    imported++;
  }

  return NextResponse.json({ saved, imported, tag });
}

function toNumber(value: string | number | undefined): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) ? null : n;
}
