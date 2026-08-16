import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const schema = z.object({
  provider: z.enum(["RESEND", "SMTP"]).default("RESEND"),
  apiKey: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
  signature: z.string().optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const account = await prisma.emailAccount.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!account) return NextResponse.json(null);

  return NextResponse.json({
    id: account.id,
    provider: account.provider || "RESEND",
    apiKey: account.apiKey ? "••••••••" : "",
    hasApiKey: Boolean(account.apiKey),
    host: account.host || "",
    port: account.port || 587,
    secure: Boolean(account.secure),
    username: account.username || "",
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    signature: account.signature || "",
    isActive: account.isActive,
    hasPassword: Boolean(account.password),
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, apiKey, password, signature, ...rest } = parsed.data;
  const existing = await prisma.emailAccount.findFirst();

  if (provider === "RESEND" && !apiKey && !existing?.apiKey) {
    return NextResponse.json(
      { error: "Please enter a valid Resend API key (e.g. re_123456...)" },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {
    ...rest,
    provider,
    signature: signature ?? "",
    isActive: true,
  };

  if (apiKey && !apiKey.includes("••••")) {
    updateData.apiKey = apiKey;
  } else if (!existing && apiKey) {
    updateData.apiKey = apiKey;
  }

  if (password) {
    updateData.password = password;
  }

  const account = existing
    ? await prisma.emailAccount.update({
        where: { id: existing.id },
        data: updateData,
      })
    : await prisma.emailAccount.create({
        data: {
          ...updateData,
          fromEmail: rest.fromEmail,
          password: password ?? "",
        } as any,
      });

  return NextResponse.json({
    id: account.id,
    provider: account.provider,
    apiKey: account.apiKey ? "••••••••" : "",
    hasApiKey: Boolean(account.apiKey),
    host: account.host || "",
    port: account.port || 587,
    secure: Boolean(account.secure),
    username: account.username || "",
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    signature: account.signature,
    isActive: account.isActive,
  });
}
