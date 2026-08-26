import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPercent } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignControls } from "@/components/campaigns/campaign-controls";
import { assertOwns } from "@/lib/api";
import { requirePageSession } from "@/lib/page-auth";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session } = await requirePageSession();
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      recipients: {
        include: { contact: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      },
    },
  });

  if (!campaign || !assertOwns(campaign.ownerId, session)) notFound();

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${campaign.template.name} · ${campaign.template.language}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={campaignStatusTone(campaign.status)}>
              {campaign.status}
            </Badge>
            <CampaignControls id={campaign.id} status={campaign.status} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Audience" value={campaign.totalCount} />
        <StatCard
          label="Sent"
          value={`${campaign.sentCount} (${formatPercent(campaign.sentCount, campaign.totalCount)})`}
        />
        <StatCard
          label="Delivered"
          value={`${campaign.deliveredCount} (${formatPercent(campaign.deliveredCount, campaign.totalCount)})`}
        />
        <StatCard label="Failed" value={campaign.failedCount} />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((r) => (
                <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {r.contact.name || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {r.contact.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.status === "FAILED"
                          ? "danger"
                          : r.status === "READ" || r.status === "DELIVERED"
                            ? "success"
                            : r.status === "SENT"
                              ? "info"
                              : "default"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">
                    {r.errorMessage || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
