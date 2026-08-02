import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { InboxClient } from "@/components/inbox/inbox-client";

export default async function InboxPage() {
  const conversations = await prisma.conversation.findMany({
    where: { channel: "WHATSAPP" },
    orderBy: { lastMessageAt: "desc" },
    include: { contact: true },
    take: 100,
  });

  const serializable = conversations.map((c) => ({
    id: c.id,
    channel: "WHATSAPP" as const,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.lastMessagePreview,
    unreadCount: c.unreadCount,
    windowExpiresAt: c.windowExpiresAt?.toISOString() ?? null,
    contact: {
      id: c.contact.id,
      name: c.contact.name,
      phone: c.contact.phone,
      email: c.contact.email,
    },
  }));

  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-[#111b21] text-sm text-[#8696a0]">
          Loading chats…
        </div>
      }
    >
      <InboxClient initialConversations={serializable} />
    </Suspense>
  );
}
