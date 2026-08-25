import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertOwns, forbidden, requireSession } from "@/lib/api";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const { id } = await params;

  try {
    const inbound = await prisma.inboundEmail.findUnique({
      where: { id },
      include: { inbox: { select: { ownerId: true } } },
    });
    if (!inbound) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (!assertOwns(inbound.inbox.ownerId, session)) return forbidden();

    await prisma.inboundEmail.update({
      where: { id },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to mark as read";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
