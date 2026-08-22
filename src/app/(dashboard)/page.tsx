import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSendingCapacityStats } from "@/lib/email/rotator";
import {
  RECOMMENDED_DOMAIN_COUNT,
  RECOMMENDED_INBOX_COUNT,
  SYSTEM_DAILY_TARGET,
} from "@/lib/email/constants";

export default async function OverviewPage() {
  const [
    contacts,
    campaigns,
    emailsToday,
    inboxAccounts,
    capacity,
    recentCampaigns,
    recentMessages,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.message.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.emailAccount.count({ where: { isActive: true } }),
    getSendingCapacityStats(),
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
  ]);

  return (
    <div>
      <PageHeader
        title="Email Outreach Overview"
        description="Cold email campaigns, multi-inbox rotation, and lead outreach performance."
        actions={
          <>
            <Link href="/compose">
              <Button>Compose Email</Button>
            </Link>
            <Link href="/campaigns/new">
              <Button variant="outline">New Cold Campaign</Button>
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">5k/Day Sending Capacity</p>
            <Badge
              tone={
                capacity.inboxCapacityToday >= SYSTEM_DAILY_TARGET
                  ? "success"
                  : "warning"
              }
            >
              {capacity.inboxRemainingToday.toLocaleString()} remaining today
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {capacity.activeInboxes}/{RECOMMENDED_INBOX_COUNT} mailboxes ·{" "}
            {capacity.verifiedDomains}/{RECOMMENDED_DOMAIN_COUNT} verified domains ·{" "}
            {capacity.inboxSentToday.toLocaleString()} sent today
          </p>
          <div className="mt-2 flex gap-2">
            <Link href="/mailboxes">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Manage Mailboxes
              </Button>
            </Link>
            <Link href="/domains">
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Manage Domains
              </Button>
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">Multi-Inbox Rotation Pool</p>
            <Badge tone={inboxAccounts > 0 ? "success" : "warning"}>
              {inboxAccounts > 0 ? `${inboxAccounts} Mailboxes Active` : "Setup Needed"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Domain-first round-robin · 45–90s between campaign sends · warmup enabled by default
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Client Leads" value={formatNumber(contacts)} />
        <StatCard label="Outreach Campaigns" value={formatNumber(campaigns)} />
        <StatCard label="Emails Sent Today" value={formatNumber(emailsToday)} />
        <StatCard label="Active Sending Inboxes" value={formatNumber(inboxAccounts)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Cold Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCampaigns.length === 0 ? (
              <p className="text-sm text-zinc-500">No campaigns launched yet.</p>
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
            <CardTitle>Latest Outbound &amp; Inbound Emails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMessages.length === 0 ? (
              <p className="text-sm text-zinc-500">No email records yet.</p>
            ) : (
              recentMessages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {m.contact.name || m.contact.email || m.contact.phone}
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
