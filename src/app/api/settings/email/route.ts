import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const schema = z.object({
  id: z.string().optional(),
  provider: z.enum(["RESEND", "SMTP"]).default("SMTP"),
  apiKey: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
  signature: z.string().optional(),
  dailyLimit: z.number().int().min(5).max(5000).optional().default(50),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "desc" },
  });

  const formatted = accounts.map((acc) => ({
    id: acc.id,
    provider: acc.provider || "SMTP",
    apiKey: acc.apiKey ? "••••••••" : "",
    hasApiKey: Boolean(acc.apiKey),
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
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, provider, apiKey, password, signature, dailyLimit, isActive, ...rest } = parsed.data;

  const updateData: Record<string, unknown> = {
    ...rest,
    provider,
    signature: signature ?? "",
    dailyLimit: dailyLimit ?? 50,
    isActive: isActive ?? true,
  };

  if (apiKey && !apiKey.includes("••••")) {
    updateData.apiKey = apiKey;
  }

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
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Account ID is missing" }, { status: 400 });

  await prisma.emailAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
