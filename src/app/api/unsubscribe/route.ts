import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  if (!email) {
    return new NextResponse("Invalid unsubscribe request", { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  try {
    // 1. Add to suppression list
    await prisma.suppressionList.upsert({
      where: { email: normalized },
      create: { email: normalized, reason: "UNSUBSCRIBED" },
      update: { reason: "UNSUBSCRIBED" },
    });

    // 2. Mark contact opted out
    await prisma.contact.updateMany({
      where: { email: normalized },
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
  } catch (e) {
    return new NextResponse("Error processing unsubscribe request", { status: 500 });
  }
}
