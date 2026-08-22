import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, ensureDbSchema } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { generateDkimKeyPair } from "@/lib/email/dkim";
import { verifyDomainDns } from "@/lib/email/dns-checker";
import {
  buildSpfRecordHint,
  DEFAULT_DOMAIN_DAILY_LIMIT,
} from "@/lib/email/constants";

const schema = z.object({
  domainName: z.string().min(3),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const domains = await prisma.sendingDomain.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { mailboxes: true } },
      },
    });

    // Re-verify live DNS on fetch to update stale DB records
    const formatted = await Promise.all(
      domains.map(async (d) => {
        const selector = d.dkimSelector || "dkim";
        const dnsResult = await verifyDomainDns(d.domainName, selector, d.dkimPublicKey);

        // Update DB if state changed
        if (
          d.spfVerified !== dnsResult.spf.verified ||
          d.dkimVerified !== dnsResult.dkim.verified ||
          d.dmarcVerified !== dnsResult.dmarc.verified ||
          d.mxVerified !== dnsResult.mx.verified ||
          d.isVerified !== dnsResult.isFullyConfigured
        ) {
          await prisma.sendingDomain.update({
            where: { id: d.id },
            data: {
              spfVerified: dnsResult.spf.verified,
              dkimVerified: dnsResult.dkim.verified,
              dmarcVerified: dnsResult.dmarc.verified,
              mxVerified: dnsResult.mx.verified,
              isVerified: dnsResult.isFullyConfigured,
              lastCheckedAt: new Date(),
            },
          });
        }

        return {
          id: d.id,
          domainName: d.domainName,
          dkimSelector: selector,
          dkimPublicKey: d.dkimPublicKey || "",
          spfRecordHint:
            d.spfRecordHint || buildSpfRecordHint(d.domainName),
          spfVerified: dnsResult.spf.verified,
          dkimVerified: dnsResult.dkim.verified,
          dmarcVerified: dnsResult.dmarc.verified,
          mxVerified: dnsResult.mx.verified,
          isVerified: dnsResult.isFullyConfigured,
          dailyLimit: d.dailyLimit,
          sentToday: d.sentToday,
          mailboxCount: d._count.mailboxes,
          lastCheckedAt: new Date().toISOString(),
        };
      }),
    );

    return NextResponse.json({ domains: formatted });
  } catch (e) {
    console.error("GET /api/domains error:", e);
    return NextResponse.json(
      { domains: [], error: e instanceof Error ? e.message : "Error fetching domains" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    await ensureDbSchema();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
    }

    const domainName = parsed.data.domainName
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    const selector = "dkim";

    let domainRecord = await prisma.sendingDomain.findUnique({
      where: { domainName },
    });

    const spfHint = buildSpfRecordHint(domainName);

    if (!domainRecord || !domainRecord.dkimPrivateKey) {
      const keyPair = generateDkimKeyPair(domainName, selector);
      domainRecord = await prisma.sendingDomain.upsert({
        where: { domainName },
        create: {
          domainName,
          dkimPrivateKey: keyPair.privateKey,
          dkimPublicKey: keyPair.publicKey,
          dkimSelector: selector,
          spfRecordHint: spfHint,
          dailyLimit: DEFAULT_DOMAIN_DAILY_LIMIT,
        },
        update: {
          dkimPrivateKey: keyPair.privateKey,
          dkimPublicKey: keyPair.publicKey,
          dkimSelector: selector,
          spfRecordHint: spfHint,
        },
      });
    }

    const dnsResult = await verifyDomainDns(
      domainName,
      domainRecord.dkimSelector || selector,
      domainRecord.dkimPublicKey,
    );

    const updated = await prisma.sendingDomain.update({
      where: { id: domainRecord.id },
      data: {
        spfVerified: dnsResult.spf.verified,
        dkimVerified: dnsResult.dkim.verified,
        dmarcVerified: dnsResult.dmarc.verified,
        mxVerified: dnsResult.mx.verified,
        isVerified: dnsResult.isFullyConfigured,
        lastCheckedAt: new Date(),
      },
    });

    return NextResponse.json({
      domain: {
        id: updated.id,
        domainName: updated.domainName,
        dkimSelector: updated.dkimSelector,
        dkimPublicKey: updated.dkimPublicKey,
        spfVerified: updated.spfVerified,
        dkimVerified: updated.dkimVerified,
        dmarcVerified: updated.dmarcVerified,
        mxVerified: updated.mxVerified,
        isVerified: updated.isVerified,
      },
      dnsResult,
    });
  } catch (e) {
    console.error("POST /api/domains error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error saving domain" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Domain ID missing" }, { status: 400 });

    await prisma.sendingDomain.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/domains error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error deleting domain" },
      { status: 500 },
    );
  }
}
