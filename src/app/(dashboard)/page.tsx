import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatPercent } from "@/lib/utils";
import { PageHeader, StatCard, EmptyState } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSendingCapacityStats } from "@/lib/email/rotator";
import { requirePageSession } from "@/lib/page-auth";

function startOfToday() {
  return new Date(new Date().setHours(0, 0, 0, 0));
}

function progressPct(sent: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((sent / total) * 100));
}

export default async function OverviewPage() {
  const { scope } = await requirePageSession();
  const today = startOfToday();

  const [
    leads,
    emailReadyLeads,
    runningCount,
    pausedCount,
    sentToday,
    openedToday,
    failedToday,
    unreadReplies,
    capacity,
    activeCampaigns,
    latestReplies,
  ] = await Promise.all([
    prisma.contact.count({ where: scope }),
    prisma.contact.count({
      where: {
        ...scope,
        email: { not: null },
        emailOptedOut: false,
      },
    }),
    prisma.campaign.count({ where: { ...scope, status: "RUNNING" } }),
    prisma.campaign.count({ where: { ...scope, status: "PAUSED" } }),
    prisma.message.count({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: { in: ["SENT", "DELIVERED", "READ"] },
        createdAt: { gte: today },
        contact: scope,
      },
    }),
    prisma.campaignRecipient.count({
      where: {
        status: "READ",
        readAt: { gte: today },
        campaign: scope,
      },
    }),
    prisma.message.count({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: "FAILED",
        createdAt: { gte: today },
        contact: scope,
      },
    }),
    prisma.inboundEmail.count({
      where: {
        isRead: false,
        isBounce: false,
        inbox: scope,
      },
    }),
    getSendingCapacityStats(scope.ownerId),
    prisma.campaign.findMany({
      where: {
        ...scope,
        status: { in: ["RUNNING", "PAUSED"] },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 8,
      include: { template: true },
    }),
    prisma.inboundEmail.findMany({
      where: {
        isBounce: false,
        inbox: scope,
      },
      orderBy: { receivedAt: "desc" },
      take: 6,
      include: {
        contact: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const openRateToday =
    sentToday > 0 ? ((openedToday / sentToday) * 100).toFixed(1) : null;
  const isEmpty = leads === 0 && activeCampaigns.length === 0 && sentToday === 0;

  const alerts: { tone: "warning" | "danger" | "info"; text: string; href: string; cta: string }[] =
    [];
  if (capacity.activeInboxes === 0) {
    alerts.push({
      tone: "warning",
      text: "No active sending mailboxes — campaigns cannot send.",
      href: "/mailboxes",
      cta: "Add mailbox",
    });
  } else if (capacity.inboxRemainingToday === 0 && capacity.inboxCapacityToday > 0) {
    alerts.push({
      tone: "warning",
      text: "Daily send limit reached across your mailboxes.",
      href: "/mailboxes",
      cta: "View mailboxes",
    });
  }
  if (unreadReplies > 0) {
    alerts.push({
      tone: "info",
      text: `${unreadReplies} unread ${unreadReplies === 1 ? "reply" : "replies"} waiting in inbox.`,
      href: "/inbox",
      cta: "Open inbox",
    });
  }
  if (failedToday > 0) {
    alerts.push({
      tone: "danger",
      text: `${failedToday} send ${failedToday === 1 ? "failure" : "failures"} today.`,
      href: "/emails",
      cta: "Review sent",
    });
  }
  if (pausedCount > 0) {
    alerts.push({
      tone: "warning",
      text: `${pausedCount} paused ${pausedCount === 1 ? "campaign" : "campaigns"}.`,
      href: "/campaigns",
      cta: "View campaigns",
    });
  }

  if (isEmpty) {
    return (
      <div>
        <PageHeader
          title="Overview"
          description="Your cold email workspace at a glance."
        />
        <EmptyState
          title="Get your outreach engine running"
          description="Connect a mailbox, import leads, then launch a campaign. Each account keeps its own data."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/mailboxes">
                <Button>Connect mailbox</Button>
              </Link>
              <Link href="/contacts">
                <Button variant="outline">Import leads</Button>
              </Link>
              <Link href="/campaigns/new">
                <Button variant="outline">New campaign</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Today’s sending performance, active campaigns, and replies that need you."
        actions={
          <>
            <Link href="/inbox">
              <Button variant="outline">
                Inbox
                {unreadReplies > 0 ? (
                  <span className="ml-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadReplies}
                  </span>
                ) : null}
              </Button>
            </Link>
            <Link href="/campaigns/new">
              <Button>New campaign</Button>
            </Link>
          </>
        }
      />

      {alerts.length > 0 ? (
        <div className="mb-5 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.text}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2 min-w-0">
                <Badge tone={a.tone} className="mt-0.5 shrink-0">
                  {a.tone === "danger"
                    ? "Issue"
                    : a.tone === "info"
                      ? "Reply"
                      : "Attention"}
                </Badge>
                <p className="text-sm text-zinc-700">{a.text}</p>
              </div>
              <Link href={a.href} className="shrink-0">
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  {a.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sent today"
          value={formatNumber(sentToday)}
          hint={
            capacity.activeInboxes > 0
              ? `${formatNumber(capacity.inboxRemainingToday)} remaining capacity`
              : "No active mailboxes"
          }
        />
        <StatCard
          label="Opens today"
          value={formatNumber(openedToday)}
          hint={openRateToday ? `${openRateToday}% open rate` : "No sends yet today"}
        />
        <StatCard
          label="Unread replies"
          value={formatNumber(unreadReplies)}
          hint="Inbound that still needs a read"
        />
        <StatCard
          label="Failed today"
          value={formatNumber(failedToday)}
          hint={
            runningCount > 0
              ? `${runningCount} campaign${runningCount === 1 ? "" : "s"} running`
              : "No campaigns running"
          }
        />
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        {formatNumber(emailReadyLeads)} email-ready leads · {formatNumber(leads)} total
        contacts · {capacity.activeInboxes} active mailbox
        {capacity.activeInboxes === 1 ? "" : "es"} · {capacity.verifiedDomains} verified
        domain{capacity.verifiedDomains === 1 ? "" : "s"}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Active campaigns</CardTitle>
            <Link
              href="/campaigns"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeCampaigns.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-200 px-3 py-8 text-center">
                <p className="text-sm text-zinc-500">No running or paused campaigns.</p>
                <Link href="/campaigns/new" className="mt-3 inline-block">
                  <Button size="sm">Launch a campaign</Button>
                </Link>
              </div>
            ) : (
              activeCampaigns.map((c) => {
                const pct = progressPct(c.sentCount, c.totalCount);
                return (
                  <Link
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    className="block rounded-md border border-zinc-100 px-3 py-3 transition hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {c.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {c.template.name} · {c.sentCount}/{c.totalCount} sent ·{" "}
                          {formatPercent(c.failedCount, c.totalCount)} failed
                        </p>
                      </div>
                      <Badge tone={campaignStatusTone(c.status)}>{c.status}</Badge>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">{pct}% complete</p>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Latest replies</CardTitle>
            <Link
              href="/inbox"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              Inbox
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestReplies.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                No inbound replies yet.
              </p>
            ) : (
              latestReplies.map((r) => (
                <Link
                  key={r.id}
                  href="/inbox"
                  className="flex items-start justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2.5 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!r.isRead ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                      ) : null}
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {r.contact?.name || r.fromName || r.fromEmail}
                      </p>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {r.subject || r.bodyText || "No subject"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-400">
                    {formatDistanceToNow(r.receivedAt, { addSuffix: true })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/compose">
          <Button variant="outline" size="sm">
            Compose email
          </Button>
        </Link>
        <Link href="/leads">
          <Button variant="outline" size="sm">
            Find leads
          </Button>
        </Link>
        <Link href="/emails">
          <Button variant="outline" size="sm">
            Sent tracker
          </Button>
        </Link>
        <Link href="/mailboxes">
          <Button variant="outline" size="sm">
            Mailboxes
          </Button>
        </Link>
      </div>
    </div>
  );
}
