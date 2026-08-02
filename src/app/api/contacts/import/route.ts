import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    return NextResponse.json(
      { error: "Failed to parse CSV", details: parsed.errors.slice(0, 3) },
      { status: 400 },
    );
  }

  let imported = 0;
  let skipped = 0;

  for (const row of parsed.data) {
    const phoneRaw =
      row.phone || row.Phone || row.mobile || row.Mobile || row.number || "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    const email = (row.email || row.Email || "").trim() || null;
    const name = row.name || row.Name || row.full_name || null;
    const tagsRaw = row.tags || row.Tags || "";
    const tags = tagsRaw
      ? tagsRaw.split(/[,|]/).map((t) => t.trim()).filter(Boolean)
      : [];

    if ((!phone || phone.length < 8) && !email) {
      skipped++;
      continue;
    }

    if (phone && phone.length >= 8) {
      await prisma.contact.upsert({
        where: { phone },
        update: {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(tags.length ? { tags } : {}),
        },
        create: { phone, name, email, tags },
      });
    } else if (email) {
      await prisma.contact.upsert({
        where: { email },
        update: {
          ...(name ? { name } : {}),
          ...(tags.length ? { tags } : {}),
        },
        create: { email, name, tags },
      });
    }
    imported++;
  }

  return NextResponse.json({ imported, skipped });
}
