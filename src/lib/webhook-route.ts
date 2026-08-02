import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppWebhook } from "@/lib/webhooks";
import type { MetaWebhookPayload } from "@/lib/meta/types";

export async function handleWebhookVerify(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const account = await prisma.whatsAppAccount.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  const expected =
    account?.webhookVerifyToken ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    "whatsapp_bulk_verify_token";

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function handleWebhookPost(req: NextRequest) {
  try {
    const payload = (await req.json()) as MetaWebhookPayload;
    await handleWhatsAppWebhook(payload);
  } catch (error) {
    console.error("Webhook error:", error);
  }
  return NextResponse.json({ success: true });
}
