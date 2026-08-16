import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { generateDkimKeyPair } from "@/lib/email/dkim";
import { verifyDomainDns } from "@/lib/email/dns-checker";

const schema = z.object({
  domainName: z.string().min(3),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const domains = await prisma.sendingDomain.findMany({
    orderBy: { createdAt: "desc" },
  });

  const formatted = domains.map((d) => ({
    id: d.id,
    domainName: d.domainName,
    dkimSelector: d.dkimSelector || "dkim",
    dkimPublicKey: d.dkimPublicKey || "",
    spfVerified: d.spfVerified,
    dkimVerified: d.dkimVerified,
    dmarcVerified: d.dmarcVerified,
    mxVerified: d.mxVerified,
    isVerified: d.isVerified,
    lastCheckedAt: d.lastCheckedAt ? d.lastCheckedAt.toISOString() : null,
  }));

  return NextResponse.json({ domains: formatted });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
  }

  const domainName = parsed.data.domainName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const selector = "dkim";

  // Check if domain exists, or generate new DKIM keypair
  let domainRecord = await prisma.sendingDomain.findUnique({
    where: { domainName },
  });

  if (!domainRecord || !domainRecord.dkimPrivateKey) {
    const keyPair = generateDkimKeyPair(domainName, selector);
    domainRecord = await prisma.sendingDomain.upsert({
      where: { domainName },
      create: {
        domainName,
        dkimPrivateKey: keyPair.privateKey,
        dkimPublicKey: keyPair.publicKey,
        dkimSelector: selector,
      },
      update: {
        dkimPrivateKey: keyPair.privateKey,
        dkimPublicKey: keyPair.publicKey,
        dkimSelector: selector,
      },
    });
  }

  // Audit DNS records against live DNS servers
  const dnsResult = await verifyDomainDns(domainName, domainRecord.dkimSelector || selector);

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
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Domain ID missing" }, { status: 400 });

  await prisma.sendingDomain.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
