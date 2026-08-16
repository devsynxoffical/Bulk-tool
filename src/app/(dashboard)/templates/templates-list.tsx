"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";

type TemplateItem = {
  id: string;
  name: string;
  channel: "WHATSAPP" | "EMAIL";
  language: string;
  category: string;
  status: string;
  subject: string | null;
  body: string | null;
  header: string | null;
  footer: string | null;
  isSample: boolean;
};

function statusTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING" || status === "IN_APPEAL") return "warning" as const;
  return "danger" as const;
}

function channelTone(channel: string) {
  return channel === "WHATSAPP" ? ("whatsapp" as const) : ("info" as const);
}

export function TemplatesList({ templates }: { templates: TemplateItem[] }) {
  const [tab, setTab] = useState<"ALL" | "WHATSAPP" | "EMAIL">("ALL");

  const filtered = templates.filter((t) => {
    if (tab === "WHATSAPP") return t.channel === "WHATSAPP";
    if (tab === "EMAIL") return t.channel === "EMAIL";
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
          All Templates ({templates.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("WHATSAPP")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === "WHATSAPP"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <span>💬</span> WhatsApp ({templates.filter((t) => t.channel === "WHATSAPP").length})
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
          <span>✉️</span> Email ({templates.filter((t) => t.channel === "EMAIL").length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${tab !== "ALL" ? tab.toLowerCase() : ""} templates`}
          description="Create a template to reuse in your bulk campaigns."
          action={<TemplateActions />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate font-mono text-xs">
                    {t.name}
                  </CardTitle>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {t.language} · {t.category}
                    {t.subject ? ` · ${t.subject}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex gap-1">
                    <Badge tone={channelTone(t.channel)}>{t.channel}</Badge>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </div>
                  {t.isSample ? <Badge>Sample</Badge> : null}
                </div>
              </CardHeader>
              <CardContent>
                {t.header ? (
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {t.header}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {t.body || "No body preview"}
                </p>
                {t.footer ? (
                  <p className="mt-2 text-[11px] text-zinc-400">{t.footer}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
