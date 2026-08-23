"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { formatPercent } from "@/lib/utils";
import { EmptyState } from "@/components/layout/page-header";
import { Badge, campaignStatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CampaignWithTemplate = {
  id: string;
  name: string;
  channel: "WHATSAPP" | "EMAIL";
  status: string;
  sentCount: number;
  totalCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: Date | string;
  template: { name: string };
};

export function CampaignsList({ campaigns }: { campaigns: CampaignWithTemplate[] }) {
  const [tab, setTab] = useState<"ALL" | "WHATSAPP" | "EMAIL">("ALL");

  const filtered = campaigns.filter((c) => {
    if (tab === "WHATSAPP") return c.channel === "WHATSAPP";
    if (tab === "EMAIL") return c.channel === "EMAIL";
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setTab("ALL")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === "ALL"
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          All Campaigns ({campaigns.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("EMAIL")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === "EMAIL"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <span>✉️</span> Email ({campaigns.filter((c) => c.channel === "EMAIL").length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${tab !== "ALL" ? tab.toLowerCase() : ""} campaigns found`}
          description="Create a WhatsApp or Email campaign to message your leads and clients."
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
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const processed = c.sentCount + c.failedCount;
                  return (
                  <tr key={c.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          c.channel === "EMAIL"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {c.channel === "EMAIL" ? "✉️ Email" : "💬 WhatsApp"}
                      </span>
                    </td>
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
                          {processed}/{c.totalCount}
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({c.sentCount} sent{c.failedCount ? ` · ${c.failedCount} fail` : ""})
                          </span>
                        </p>
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-zinc-900"
                            style={{
                              width: formatPercent(processed, c.totalCount),
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
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
