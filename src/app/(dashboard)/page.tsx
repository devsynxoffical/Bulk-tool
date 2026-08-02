import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const [
    contacts,
    campaigns,
    messagesToday,
    unread,
    recentCampaigns,
    recentMessages,
    waSession,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.message.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.conversation.aggregate({ _sum: { unreadCount: true } }),
    prisma.campaign.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { template: true },
    }),
    prisma.message.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { contact: true },
    }),
    prisma.whatsAppSession.findUnique({ where: { id: "default" } }),
  ]);

  const waConnected = waSession?.status === "CONNECTED";

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Client outreach and WhatsApp campaigns."
        actions={
          <>
            <Link href="/compose">
              <Button>Start messaging</Button>
            </Link>
            <Link href="/campaigns/new">
              <Button variant="outline">New campaign</Button>
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">WhatsApp</p>
            <Badge tone={waConnected ? "success" : "warning"}>
              {waConnected ? "Connected" : "Setup needed"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {waConnected
              ? `+${waSession?.phoneNumber || ""}`.trim()
              : "Link your WhatsApp number in Settings"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients" value={formatNumber(contacts)} />
        <StatCard label="Campaigns" value={formatNumber(campaigns)} />
        <StatCard label="Messages today" value={formatNumber(messagesToday)} />
        <StatCard
          label="Unread inbox"
          value={formatNumber(unread._sum.unreadCount || 0)}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCampaigns.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaigns yet.</p>
            ) : (
              recentCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2.5 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {c.name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {c.template.name} · {c.sentCount}/{c.totalCount} sent
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={campaignStatusTone(c.status)}>{c.status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMessages.length === 0 ? (
              <p className="text-sm text-zinc-500">No messages yet.</p>
            ) : (
              recentMessages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {m.contact.name || m.contact.phone || m.contact.email}
                      </p>
                    <p className="truncate text-xs text-zinc-500">
                      {m.direction === "INBOUND" ? "← " : "→ "}
                      {m.subject || m.body || m.templateName || m.type}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    {formatDistanceToNow(m.createdAt, { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
