import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { enqueueLogout } from "@/lib/queue/whatsapp";

const schema = z.object({
  action: z.enum(["logout"]),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const session = await prisma.whatsAppSession.findUnique({
    where: { id: "default" },
  });

  let qrImage: string | null = null;
  if (session?.status === "SCANNING" && session.qrCode) {
    qrImage = await QRCode.toDataURL(session.qrCode, { width: 240, margin: 1 });
  }

  return NextResponse.json({
    status: session?.status ?? "DISCONNECTED",
    phoneNumber: session?.phoneNumber ?? null,
    lastConnectedAt: session?.lastConnectedAt?.toISOString() ?? null,
    qrImage,
    connected: session?.status === "CONNECTED",
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (parsed.data.action === "logout") {
    await enqueueLogout();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
