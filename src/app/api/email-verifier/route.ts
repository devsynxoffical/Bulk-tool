import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { verifyEmail } from "@/lib/email/verifier";

const singleSchema = z.object({
  email: z.string().email(),
  checkSocket: z.boolean().optional().default(true),
});

const bulkSchema = z.object({
  emails: z.array(z.string()).max(200),
  checkSocket: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json();

    if (Array.isArray(body.emails)) {
      const parsed = bulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid email array format" }, { status: 400 });
      }

      const results = [];
      for (const email of parsed.data.emails) {
        const res = await verifyEmail(email, {
          checkSmtpSocket: parsed.data.checkSocket,
          timeoutMs: 2500,
        });
        results.push(res);
      }

      const validCount = results.filter((r) => r.isValid).length;
      const invalidCount = results.filter((r) => !r.isValid).length;

      return NextResponse.json({
        total: results.length,
        validCount,
        invalidCount,
        results,
      });
    }

    const parsed = singleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const result = await verifyEmail(parsed.data.email, {
      checkSmtpSocket: parsed.data.checkSocket,
      timeoutMs: 4000,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
