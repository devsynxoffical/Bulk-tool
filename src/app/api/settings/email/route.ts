import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, ensureDbSchema } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  DEFAULT_INBOX_DAILY_LIMIT,
  extractDomainFromEmail,
} from "@/lib/email/constants";
import {
  getAutoWarmupStage,
  getWarmupDayNumber,
  resolveWarmupContext,
} from "@/lib/email/warmup";
import { restartMailboxWarmup } from "@/lib/email/warmup-sync";
import { getInboxOpenStats, recalculateInboxHealth } from "@/lib/email/health";

const createSchema = z.object({
  id: z.string().optional(),
  provider: z.string().default("SMTP"),
  host: z.string().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional().default(false),
  username: z.string().min(1, "SMTP username is required"),
  password: z.string().optional(),
  fromEmail: z.string().email("Valid sender email is required"),
  fromName: z.string().optional(),
  signature: z.string().optional(),
  domainId: z.string().optional().nullable(),
  dailyLimit: z
    .number()
    .int()
    .min(5)
    .max(500)
    .optional()
    .default(DEFAULT_INBOX_DAILY_LIMIT),
  warmupEnabled: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

const signatureOnlySchema = z.object({
  id: z.string(),
  signature: z.string(),
});

const toggleActiveSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

async function resolveDomainId(
  fromEmail: string,
  explicitDomainId?: string | null,
): Promise<string | null> {
  if (explicitDomainId) return explicitDomainId;

  const domainName = extractDomainFromEmail(fromEmail);
  if (!domainName) return null;

  const domain = await prisma.sendingDomain.findUnique({
    where: { domainName },
    select: { id: true },
  });
  return domain?.id ?? null;
}

function formatAccount(
  acc: Awaited<ReturnType<typeof prisma.emailAccount.findMany>>[number] & {
    domain?: {
      domainName: string;
      isVerified: boolean;
    } | null;
  },
  openStats?: {
    sent: number;
    opened: number;
    openRate: number;
    healthScore: number;
    sampleReady: boolean;
  },
) {
  const warmup = resolveWarmupContext(acc);
  const healthScore = openStats?.healthScore ?? Math.max(0, Math.min(100, acc.healthScore ?? 100));
  return {
    id: acc.id,
    provider: "SMTP",
    host: acc.host || "",
    port: acc.port || 587,
    secure: Boolean(acc.secure),
    username: acc.username || "",
    fromEmail: acc.fromEmail,
    fromName: acc.fromName,
    signature: acc.signature || "",
    domainId: acc.domainId,
    domainName: acc.domain?.domainName || extractDomainFromEmail(acc.fromEmail),
    domainVerified: acc.domain?.isVerified ?? false,
    dailyLimit: acc.dailyLimit || DEFAULT_INBOX_DAILY_LIMIT,
    effectiveDailyLimit: warmup.effectiveDailyLimit,
    sentToday: acc.sentToday || 0,
    healthScore,
    openRate: openStats ? Math.round(openStats.openRate * 1000) / 10 : null,
    opensTracked: openStats?.opened ?? null,
    sendsTracked: openStats?.sent ?? null,
    openSampleReady: openStats?.sampleReady ?? false,
    warmupEnabled: acc.warmupEnabled,
    warmupStage: warmup.stage,
    warmupDay: warmup.warmupDay,
    warmupComplete: warmup.isComplete,
    warmupLabel: warmup.stageLabel,
    daysUntilNextStage: warmup.daysUntilNextStage,
    warmupStartedAt: warmup.startedAt.toISOString(),
    isActive: acc.isActive,
    hasPassword: Boolean(acc.password),
    lastInboxSyncAt: acc.lastInboxSyncAt?.toISOString() ?? null,
    inboxSyncError: acc.inboxSyncError ?? null,
    createdAt: acc.createdAt.toISOString(),
  };
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const accounts = await prisma.emailAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        domain: {
          select: {
            id: true,
            domainName: true,
            isVerified: true,
            dailyLimit: true,
            sentToday: true,
          },
        },
      },
    });

    // Backfill warmupStartedAt + sync auto stage
    await Promise.all(
      accounts.map(async (acc) => {
        if (!acc.warmupEnabled) return;

        let startedAt = acc.warmupStartedAt ?? acc.createdAt;
        if (!acc.warmupStartedAt) {
          await prisma.emailAccount.update({
            where: { id: acc.id },
            data: { warmupStartedAt: acc.createdAt },
          });
          acc.warmupStartedAt = acc.createdAt;
          startedAt = acc.createdAt;
        }

        const stage = getAutoWarmupStage(getWarmupDayNumber(startedAt));
        if (acc.warmupStage !== stage) {
          await prisma.emailAccount.update({
            where: { id: acc.id },
            data: { warmupStage: stage },
          });
          acc.warmupStage = stage;
        }
      }),
    );

    // Sync health from open rate (clamped 0–100) and return open stats
    const formatted = await Promise.all(
      accounts.map(async (acc) => {
        let stats;
        try {
          // Fix legacy negative health or drift from open-rate formula
          if (acc.healthScore < 0 || acc.healthScore > 100) {
            stats = await recalculateInboxHealth(acc.id);
          } else {
            stats = await getInboxOpenStats(acc.id);
            if (stats.sampleReady && stats.healthScore !== acc.healthScore) {
              stats = await recalculateInboxHealth(acc.id);
            }
          }
        } catch {
          stats = undefined;
        }
        return formatAccount(acc, stats);
      }),
    );

    return NextResponse.json({
      accounts: formatted,
    });
  } catch (e) {
    console.error("GET /api/settings/email error:", e);
    return NextResponse.json(
      {
        accounts: [],
        error: e instanceof Error ? e.message : "Error fetching email accounts",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const body = await req.json();

    const sigOnly = signatureOnlySchema.safeParse(body);
    if (sigOnly.success) {
      const account = await prisma.emailAccount.update({
        where: { id: sigOnly.data.id },
        data: { signature: sigOnly.data.signature },
      });
      return NextResponse.json({ success: true, account });
    }

    const toggleOnly = toggleActiveSchema.safeParse(body);
    if (
      toggleOnly.success &&
      body &&
      typeof body === "object" &&
      !("host" in body) &&
      !("fromEmail" in body)
    ) {
      const account = await prisma.emailAccount.update({
        where: { id: toggleOnly.data.id },
        data: { isActive: toggleOnly.data.isActive },
      });
      return NextResponse.json({
        success: true,
        account,
        message: toggleOnly.data.isActive
          ? "Mailbox resumed — back in send rotation."
          : "Mailbox paused — removed from send rotation.",
      });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(" | ");
      return NextResponse.json({ error: issues || "Invalid input data" }, { status: 400 });
    }

    const {
      id,
      password,
      signature,
      domainId,
      dailyLimit,
      warmupEnabled,
      isActive,
      port,
      ...rest
    } = parsed.data;

    if (!id && !password) {
      return NextResponse.json(
        { error: "Password is required when connecting a new mailbox" },
        { status: 400 },
      );
    }

    const isPort465 = Number(port) === 465;
    const normalizedFrom = rest.fromEmail.trim().toLowerCase();
    const normalizedUser = rest.username.trim();
    const resolvedDomainId = await resolveDomainId(normalizedFrom, domainId);
    const now = new Date();
    const enablingWarmup = warmupEnabled ?? true;

    const duplicate = await prisma.emailAccount.findFirst({
      where: {
        fromEmail: { equals: normalizedFrom, mode: "insensitive" },
        ...(id ? { NOT: { id } } : {}),
      },
      select: { id: true, fromEmail: true },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Mailbox ${duplicate.fromEmail} already exists. Edit that card or delete the duplicate first — don't add the same address twice.`,
        },
        { status: 409 },
      );
    }

    const updateData: Record<string, unknown> = {
      ...rest,
      fromEmail: normalizedFrom,
      username: normalizedUser,
      port,
      secure: isPort465 ? true : parsed.data.secure,
      provider: "SMTP",
      signature: signature ?? "",
      domainId: resolvedDomainId,
      dailyLimit: dailyLimit ?? DEFAULT_INBOX_DAILY_LIMIT,
      warmupEnabled: enablingWarmup,
      isActive: isActive ?? true,
    };

    if (password) {
      updateData.password = password;
    }

    let account;
    if (id) {
      const existing = await prisma.emailAccount.findUnique({ where: { id } });
      if (existing && enablingWarmup && !existing.warmupEnabled) {
        updateData.warmupStartedAt = now;
        updateData.warmupStage = 1;
      }
      if (enablingWarmup) {
        const startedAt =
          (updateData.warmupStartedAt as Date | undefined) ??
          existing?.warmupStartedAt ??
          existing?.createdAt ??
          now;
        updateData.warmupStage = getAutoWarmupStage(
          getWarmupDayNumber(startedAt as Date),
        );
      }
      account = await prisma.emailAccount.update({
        where: { id },
        data: updateData,
      });
    } else {
      account = await prisma.emailAccount.create({
        data: {
          ...updateData,
          fromEmail: normalizedFrom,
          password: password ?? "",
          warmupStartedAt: enablingWarmup ? now : null,
          warmupStage: 1,
        } as Parameters<typeof prisma.emailAccount.create>[0]["data"],
      });
    }

    return NextResponse.json({ success: true, account });
  } catch (e) {
    console.error("POST /api/settings/email error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error saving email account" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Account ID is missing" }, { status: 400 });
    }

    await prisma.emailAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/settings/email error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error deleting email account" },
      { status: 500 },
    );
  }
}
