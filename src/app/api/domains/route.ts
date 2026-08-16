import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
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

  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
  }

  const domainName = parsed.data.domainName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  // Audit DNS records
  const dnsResult = await verifyDomainDns(domainName);

  const domain = await prisma.sendingDomain.upsert({
    where: { domainName },
    create: {
      domainName,
      spfVerified: dnsResult.spf.verified,
      dkimVerified: dnsResult.dkim.verified,
      dmarcVerified: dnsResult.dmarc.verified,
      mxVerified: dnsResult.mx.verified,
      lastCheckedAt: new Date(),
    },
    update: {
      spfVerified: dnsResult.spf.verified,
      dkimVerified: dnsResult.dkim.verified,
      dmarcVerified: dnsResult.dmarc.verified,
      mxVerified: dnsResult.mx.verified,
      lastCheckedAt: new Date(),
    },
  });

  return NextResponse.json({ domain, dnsResult });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Domain ID missing" }, { status: 400 });

  await prisma.sendingDomain.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
