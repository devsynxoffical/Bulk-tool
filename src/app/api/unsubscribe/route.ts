import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  if (!email) {
    return new NextResponse("Invalid unsubscribe request", { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  try {
    const contacts = await prisma.contact.findMany({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { ownerId: true },
    });

    const ownerIds = [...new Set(contacts.map((c) => c.ownerId))];

    // Also suppress for any mailbox owner who mailed this address
    const mailOwners = await prisma.message.findMany({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        contact: { email: { equals: normalized, mode: "insensitive" } },
        inboxId: { not: null },
      },
      select: { inboxId: true },
      take: 50,
    });
    if (mailOwners.length) {
      const inboxes = await prisma.emailAccount.findMany({
        where: {
          id: {
            in: mailOwners
              .map((m) => m.inboxId)
              .filter((id): id is string => Boolean(id)),
          },
        },
        select: { ownerId: true },
      });
      for (const i of inboxes) ownerIds.push(i.ownerId);
    }

    const uniqueOwners = [...new Set(ownerIds)];
    for (const ownerId of uniqueOwners) {
      await prisma.suppressionList.upsert({
        where: { ownerId_email: { ownerId, email: normalized } },
        create: { ownerId, email: normalized, reason: "UNSUBSCRIBED" },
        update: { reason: "UNSUBSCRIBED" },
      });
    }

    await prisma.contact.updateMany({
      where: { email: { equals: normalized, mode: "insensitive" } },
      data: { emailOptedOut: true },
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Unsubscribed Successfully</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: center; max-width: 420px; }
    h1 { font-size: 1.25rem; color: #18181b; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #71717a; line-height: 1.5; }
    .badge { display: inline-block; background: #ecfdf5; color: #047857; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Unsubscribed</div>
    <h1>You have been unsubscribed</h1>
    <p>Your email address <strong>${normalized}</strong> will no longer receive marketing or outreach messages from our system.</p>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    return new NextResponse("Error processing unsubscribe request", {
      status: 500,
    });
  }
}
