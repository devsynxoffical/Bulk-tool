import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import { scrapedLeadSchema } from "@/lib/scraper";
import { isValidRecipientEmail } from "@/lib/email/bounce-handler";

const schema = z.object({
  query: z.string().min(1),
  leads: z.array(scrapedLeadSchema).max(1000),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || parsed.data.leads.length === 0) {
    return NextResponse.json(
      { error: "No valid leads to import." },
      { status: 400 },
    );
  }

  const { query, leads } = parsed.data;
  const tag = query.trim();
  let saved = 0;
  let imported = 0;

  try {
    for (const row of leads) {
      const name = row.Name ? row.Name.trim() : companyFromWebsite(row.Website);
      const phoneRaw = row.Phone ? row.Phone.trim() : null;
      const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

      let email = row.Email ? row.Email.trim().toLowerCase() : null;
      if (email && !isValidRecipientEmail(email)) {
        email = null;
      }

      if (phone && phone.length < 8) continue;
      if (!phone && !email && !name) continue;

      // ── 1. Persist as Lead ──────────────────────────────────────────
      try {
        const existingLead = phone
          ? await prisma.lead.findFirst({ where: { phone } })
          : email
            ? await prisma.lead.findFirst({ where: { email } })
            : null;

        if (existingLead) {
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              query: tag,
              name: name ?? existingLead.name,
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
              name: name ?? "Unknown Lead",
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
      } catch (err) {
        console.warn("Lead insert/update skipped:", err);
      }

      // ── 2. Persist as Contact for Client Messaging ─────────────────
      if (!phone && !email) continue;

      try {
        const existingByPhone = phone
          ? await prisma.contact.findUnique({ where: { phone } })
          : null;
        const existingByEmail = email
          ? await prisma.contact.findUnique({ where: { email } })
          : null;

        const targetContact = existingByPhone || existingByEmail;
        const currentTags = targetContact?.tags ?? [];
        const tags = Array.from(new Set([...currentTags, tag, "email-leads", "maps-leads"]));

        const customFields = {
          company: name || "",
          city: cityFromAddress(row.Address) || cityFromQuery(tag),
          website: row.Website || null,
          address: row.Address || null,
          category: row.Category || null,
          source: row.Source || null,
        };

        if (targetContact) {
          // Check if updating email causes collision with another contact
          let safeEmail = email;
          if (email && existingByEmail && existingByEmail.id !== targetContact.id) {
            safeEmail = targetContact.email; // keep original email to avoid unique error
          }

          await prisma.contact.update({
            where: { id: targetContact.id },
            data: {
              name: name || targetContact.name || undefined,
              phone: phone || targetContact.phone || undefined,
              email: safeEmail || targetContact.email || undefined,
              tags,
              customFields,
            },
          });
          imported++;
        } else {
          await prisma.contact.create({
            data: {
              name: name || undefined,
              phone: phone || undefined,
              email: email || undefined,
              tags,
              customFields,
            },
          });
          imported++;
        }
      } catch (err) {
        console.warn("Contact upsert skipped due to constraint:", err);
      }
    }

    return NextResponse.json({ saved, imported, tag });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import leads into clients" },
      { status: 500 },
    );
  }
}

function toNumber(value: string | number | undefined): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function cityFromAddress(address: string | undefined | null): string {
  if (!address || typeof address !== "string") return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] || parts[parts.length - 1] || "";
  return parts[0] || "";
}

function cityFromQuery(query: string): string {
  const m = query.match(/\bin\s+([A-Za-z\s]+)$/i);
  return m?.[1]?.trim() || "";
}

function companyFromWebsite(website: string | undefined | null): string {
  if (!website) return "";
  try {
    const host = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    const base = host.replace(/^www\./, "").split(".")[0];
    return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}
