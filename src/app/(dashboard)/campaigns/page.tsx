import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatPercent } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Promote services, book consultations, and follow up with clients."
        actions={
          <Link href="/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a WhatsApp campaign for bookings, offers, or client follow-ups."
          action={
            <Link href="/campaigns/new">
              <Button>Create campaign</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="font-mono text-[11px] text-zinc-400">
                        {c.template.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-zinc-700">
                          {c.sentCount}/{c.totalCount}
                        </p>
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-zinc-900"
                            style={{
                              width: formatPercent(c.sentCount, c.totalCount),
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {c.deliveredCount} del · {c.readCount} read · {c.failedCount}{" "}
                      fail
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={campaignStatusTone(c.status)}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
