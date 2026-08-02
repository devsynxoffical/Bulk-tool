import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const conversationId = req.nextUrl.searchParams.get("conversationId");

  if (conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return NextResponse.json(conversation);
  }

  const conversations = await prisma.conversation.findMany({
    where: { channel: "WHATSAPP" },
    orderBy: { lastMessageAt: "desc" },
    include: { contact: true },
    take: 100,
  });

  return NextResponse.json(conversations);
}
