"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Paperclip, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { TemplateEditModal } from "@/components/templates/template-edit-modal";

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
  pdfUrl?: string | null;
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
  const router = useRouter();
  const [tab, setTab] = useState<"ALL" | "WHATSAPP" | "EMAIL">("ALL");
  const [activePreviewTemplate, setActivePreviewTemplate] = useState<TemplateItem | null>(null);
  const [activeEditingTemplate, setActiveEditingTemplate] = useState<TemplateItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = templates.filter((t) => {
    if (tab === "WHATSAPP") return t.channel === "WHATSAPP";
    if (tab === "EMAIL") return t.channel === "EMAIL";
    return true;
  });

  async function handleDelete(t: TemplateItem) {
    if (!confirm(`Are you sure you want to delete template "${t.name}"?`)) {
      return;
    }

    setDeletingId(t.id);
    try {
      const res = await fetch(`/api/templates/${t.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete template");
      } else {
        router.refresh();
      }
    } catch {
      alert("Error deleting template");
    } finally {
      setDeletingId(null);
    }
  }

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
            <Card key={t.id} className="relative group">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="min-w-0">
                  <CardTitle className="truncate font-mono text-xs text-zinc-900">
                    {t.name}
                  </CardTitle>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {t.language} · {t.category}
                    {t.subject ? ` · ${t.subject}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex gap-1">
                    <Badge tone={channelTone(t.channel)}>{t.channel}</Badge>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveEditingTemplate(t)}
                      className="h-7 w-7 p-0 text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
                      title="Edit template"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                      className="h-7 w-7 p-0 text-zinc-500 hover:text-red-600 hover:bg-red-50"
                      title="Delete template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {t.header ? (
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {t.header}
                  </p>
                ) : null}
                
                {t.channel === "EMAIL" && t.body?.includes("<") ? (
                  <div className="line-clamp-4 rounded-md border border-zinc-100 bg-zinc-50/50 p-2.5 text-xs text-zinc-600 font-sans">
                    <span className="font-semibold text-zinc-800">Subject: {t.subject}</span>
                    <div dangerouslySetInnerHTML={{ __html: t.body.slice(0, 300) }} />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                    {t.body || "No body preview"}
                  </p>
                )}

                {t.pdfUrl ? (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="truncate">Attached PDF document</span>
                  </div>
                ) : null}

                {t.footer ? (
                  <p className="text-[11px] text-zinc-400">{t.footer}</p>
                ) : null}

                {t.channel === "EMAIL" ? (
                  <div className="pt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActivePreviewTemplate(t)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview Design (Desktop & Mobile)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveEditingTemplate(t)}
                      className="flex items-center justify-center gap-1.5 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Live Preview Modal */}
      {activePreviewTemplate ? (
        <TemplatePreviewModal
          open={Boolean(activePreviewTemplate)}
          onClose={() => setActivePreviewTemplate(null)}
          template={{
            name: activePreviewTemplate.name,
            subject: activePreviewTemplate.subject,
            body: activePreviewTemplate.body,
            header: activePreviewTemplate.header,
            footer: activePreviewTemplate.footer,
            pdfUrl: activePreviewTemplate.pdfUrl,
          }}
        />
      ) : null}

      {/* Edit Template Modal */}
      {activeEditingTemplate ? (
        <TemplateEditModal
          open={Boolean(activeEditingTemplate)}
          onClose={() => setActiveEditingTemplate(null)}
          template={activeEditingTemplate}
        />
      ) : null}
    </div>
  );
}
