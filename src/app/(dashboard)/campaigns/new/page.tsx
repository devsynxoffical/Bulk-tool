"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Eye, Edit3, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  body: string | null;
  subject: string | null;
  channel: "WHATSAPP" | "EMAIL";
  isSample: boolean;
};

type ContactSummary = {
  id: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  optedOut: boolean;
  emailOptedOut: boolean;
};

type AudienceOption = {
  value: string;
  label: string;
  count: number;
  kind: "all" | "scraped" | "tag";
};

function isEmailReady(c: ContactSummary) {
  return Boolean(c.email && !c.emailOptedOut);
}

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTag = searchParams.get("tag") || "";

  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [allContacts, setAllContacts] = useState<ContactSummary[]>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [tag, setTag] = useState(initialTag);
  const [rate, setRate] = useState(10);
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: Template[]) => {
        if (Array.isArray(data)) {
          const approvedEmailTemplates = data.filter((t) => t.channel === "EMAIL");
          setAllTemplates(approvedEmailTemplates);
          if (approvedEmailTemplates.length > 0) {
            setTemplateId(approvedEmailTemplates[0].id);
            setCustomSubject(approvedEmailTemplates[0].subject || "");
            setCustomBody(approvedEmailTemplates[0].body || "");
          }
        }
      });

    fetch("/api/contacts?limit=5000")
      .then((r) => r.json())
      .then((data: ContactSummary[]) => {
        if (Array.isArray(data)) setAllContacts(data);
      });
  }, []);

  const audienceOptions = useMemo((): AudienceOption[] => {
    const emailReady = allContacts.filter(isEmailReady);
    const byTag = new Map<string, number>();

    for (const c of emailReady) {
      for (const t of c.tags) {
        const key = t.trim();
        if (!key) continue;
        byTag.set(key, (byTag.get(key) || 0) + 1);
      }
    }

    const tagOptions: AudienceOption[] = Array.from(byTag.entries())
      .map(([value, count]) => {
        const scraped =
          value === "maps-leads" ||
          value.toLowerCase().includes("maps") ||
          value.toLowerCase().includes("scrape");
        return {
          value,
          count,
          kind: scraped ? ("scraped" as const) : ("tag" as const),
          label: scraped
            ? `Scraped · ${value} (${count})`
            : `${value} (${count})`,
        };
      })
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "scraped" ? -1 : 1;
        return b.count - a.count || a.value.localeCompare(b.value);
      });

    return [
      {
        value: "",
        label: `All email leads (${emailReady.length})`,
        count: emailReady.length,
        kind: "all",
      },
      ...tagOptions,
    ];
  }, [allContacts]);

  function handleSelectTemplate(tId: string) {
    setTemplateId(tId);
    const found = allTemplates.find((t) => t.id === tId);
    if (found) {
      setCustomSubject(found.subject || "");
      setCustomBody(found.body || "");
    }
  }

  const matchingLeadsCount = allContacts.filter((c) => {
    if (tag.trim()) {
      if (!c.tags.includes(tag.trim())) return false;
    }
    return isEmailReady(c);
  }).length;

  function renderPreviewHtml(content: string) {
    if (!content) return "<p style='color:#888;'>No template content loaded.</p>";
    if (content.includes("<") && content.includes(">")) {
      return content;
    }
    return `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:16px;white-space:pre-wrap;color:#18181b;">${content}</div>`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        channel: "EMAIL",
        templateId: templateId || undefined,
        customSubject: customSubject || undefined,
        customBody: customBody || undefined,
        tag: tag || undefined,
        rateLimitPerSecond: rate,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to launch campaign");
      return;
    }

    router.push(`/campaigns/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Launch New Cold Email Campaign"
        description="Send targeted bulk cold outreach to your verified lead database with round-robin inbox rotation."
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="rounded-xl border border-zinc-200/90 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-zinc-900">Campaign Configuration</CardTitle>
                <CardDescription>
                  Configure audience targeting, select your template, and preview HTML email rendering.
                </CardDescription>
              </div>
              <Badge tone="default" className="bg-blue-50 text-blue-900 border border-blue-200">
                <Sparkles className="h-3.5 w-3.5 mr-1 text-blue-600" />
                DKIM &amp; Rotation Active
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-800">Campaign Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q3 Real Estate Outreach"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-zinc-800">
                    Select Scraped / Imported List *
                  </Label>
                  <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    <Users className="h-3 w-3" />
                    {matchingLeadsCount} Leads Selected
                  </span>
                </div>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {audienceOptions.map((opt) => (
                    <option key={opt.value || "__all__"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500">
                  Scraped lists appear after <strong>Import to Database</strong> in Lead Finder.
                  CSV imports appear under their tags.
                </p>
                {audienceOptions.length <= 1 ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    No tagged lists yet. Scrape leads → Import to Database, or upload CSV in Client Database.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 border-t border-zinc-100 pt-4">
              <Label className="text-xs font-bold text-zinc-800">Select Outreach Template *</Label>
              <select
                value={templateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.subject || "No Subject"})
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={viewMode === "preview" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("preview")}
                    className="h-8 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Live Visual HTML Preview
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "edit" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("edit")}
                    className="h-8 text-xs"
                  >
                    <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                    Edit Subject &amp; Body
                  </Button>
                </div>
                <span className="text-[11px] font-medium text-zinc-500">
                  {viewMode === "preview"
                    ? "Showing compiled visual layout"
                    : "Editing template source text"}
                </span>
              </div>

              {viewMode === "preview" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-1">
                    <p className="text-xs text-zinc-500">
                      <strong>Subject Line:</strong>{" "}
                      <span className="font-bold text-zinc-900">
                        {customSubject || "(No Subject Set)"}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden min-h-[320px]">
                    <iframe
                      srcDoc={renderPreviewHtml(customBody)}
                      title="Email Live Preview"
                      className="w-full min-h-[360px] border-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-white p-4 rounded-lg border border-zinc-200">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-800">Email Subject Line</Label>
                    <Input
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Enter custom email subject..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-800">
                      Email Body HTML / Plain Text
                    </Label>
                    <Textarea
                      rows={10}
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Enter HTML or email template body text..."
                      className="font-mono text-xs leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule &amp; Pacing</CardTitle>
            <CardDescription>
              Campaigns spread sends over 24 hours across {4} parallel workers (~5k/day max).
              Leave schedule empty to create a draft and launch manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 max-w-sm">
              <Label className="text-xs font-bold">Schedule Launch (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500">
                Requires <code className="bg-zinc-100 px-1 rounded">npm run worker</code> running
                to auto-launch at the scheduled time.
              </p>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-950">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="text-xs"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={loading || matchingLeadsCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-6"
          >
            {loading
              ? "Saving..."
              : scheduledAt
                ? "Schedule Campaign"
                : `Create Campaign (${matchingLeadsCount} Leads)`}
          </Button>
        </div>
      </form>
    </div>
  );
}
