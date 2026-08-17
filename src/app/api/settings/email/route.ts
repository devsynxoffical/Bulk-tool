import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, ensureDbSchema } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const schema = z.object({
  id: z.string().optional(),
  provider: z.string().default("SMTP"),
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional().default(false),
  username: z.string().min(1, "SMTP username is required"),
  password: z.string().optional(),
  fromEmail: z.string().email("Valid sender email is required"),
  fromName: z.string().optional(),
  signature: z.string().optional(),
  dailyLimit: z.number().int().min(5).max(5000).optional().default(50),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const accounts = await prisma.emailAccount.findMany({
      orderBy: { createdAt: "desc" },
    });

    const formatted = accounts.map((acc) => ({
      id: acc.id,
      provider: "SMTP",
      host: acc.host || "",
      port: acc.port || 587,
      secure: Boolean(acc.secure),
      username: acc.username || "",
      fromEmail: acc.fromEmail,
      fromName: acc.fromName,
      signature: acc.signature || "",
      dailyLimit: acc.dailyLimit || 50,
      sentToday: acc.sentToday || 0,
      healthScore: acc.healthScore || 100,
      isActive: acc.isActive,
      hasPassword: Boolean(acc.password),
    }));

    return NextResponse.json({ accounts: formatted });
  } catch (e) {
    console.error("GET /api/settings/email error:", e);
    return NextResponse.json(
      { accounts: [], error: e instanceof Error ? e.message : "Error fetching email accounts" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { id, password, signature, dailyLimit, isActive, ...rest } = parsed.data;

    const updateData: Record<string, unknown> = {
      ...rest,
      provider: "SMTP",
      signature: signature ?? "",
      dailyLimit: dailyLimit ?? 50,
      isActive: isActive ?? true,
    };

    if (password) {
      updateData.password = password;
    }

    let account;
    if (id) {
      account = await prisma.emailAccount.update({
        where: { id },
        data: updateData,
      });
    } else {
      account = await prisma.emailAccount.create({
        data: {
          ...updateData,
          fromEmail: rest.fromEmail,
          password: password ?? "",
        } as any,
      });
    }

    return NextResponse.json({ success: true, account });
  } catch (e) {
    console.error("POST /api/settings/email error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error saving email account" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Account ID is missing" }, { status: 400 });

    await prisma.emailAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/settings/email error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error deleting email account" },
      { status: 500 },
    );
  }
}
