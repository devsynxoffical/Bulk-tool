"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTag = searchParams.get("tag") || "";

  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [allContacts, setAllContacts] = useState<ContactSummary[]>([]);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [tag, setTag] = useState(initialTag);
  const [rate, setRate] = useState(10);
  const [var1, setVar1] = useState("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/templates")
      .then((r) => r.json())
      .then((data: Template[]) => setAllTemplates(data));

    void fetch("/api/contacts")
      .then((r) => r.json())
      .then((data: ContactSummary[]) => {
        if (Array.isArray(data)) setAllContacts(data);
      });
  }, []);

  const templates = allTemplates.filter(
    (t) => t.status === "APPROVED" && t.channel === channel,
  );
  const selected = templates.find((t) => t.id === templateId);
  if (selected === undefined && templates[0]) {
    setTemplateId(templates[0].id);
  }

  // Calculate live matching leads
  const matchingLeadsCount = allContacts.filter((c) => {
    if (tag.trim()) {
      if (!c.tags.includes(tag.trim())) return false;
    }
    if (channel === "WHATSAPP") {
      return Boolean(c.phone && !c.optedOut);
    } else {
      return Boolean(c.email && !c.emailOptedOut);
    }
  }).length;

  function switchChannel(c: "WHATSAPP" | "EMAIL") {
    setChannel(c);
    setTemplateId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        channel,
        templateId,
        tag: tag || undefined,
        rateLimitPerSecond: rate,
        variableMapping: { "1": var1 },
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to create");
      return;
    }

    router.push(`/campaigns/${data.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="New campaign"
        description="Send bulk WhatsApp messages or emails to a tagged audience."
      />

      <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Campaign details</CardTitle>
            <CardDescription>
              WhatsApp campaigns need clients with phone numbers; email campaigns
              need clients with email addresses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={channel === "WHATSAPP" ? "default" : "outline"}
                  onClick={() => switchChannel("WHATSAPP")}
                  className="flex-1"
                >
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant={channel === "EMAIL" ? "default" : "outline"}
                  onClick={() => switchChannel("EMAIL")}
                  className="flex-1"
                >
                  Email
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Campaign name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring outreach"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Template ({channel.toLowerCase()})</Label>
              <Select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select template
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isSample ? " (sample)" : ""} · {t.language}
                  </option>
                ))}
              </Select>
              {selected ? (
                <div className="space-y-2 rounded-md border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
                  {selected.subject ? (
                    <p className="font-medium text-zinc-800">
                      {selected.subject}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{selected.body}</p>
                </div>
              ) : null}
              {templates.length === 0 ? (
                <p className="text-xs text-amber-700">
                  No approved {channel.toLowerCase()} templates. Create one in{" "}
                  <a href="/templates" className="underline">
                    Templates
                  </a>
                  .
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Audience tag (optional)</Label>
                  <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    <Users className="h-3 w-3" />
                    {matchingLeadsCount} Leads
                  </span>
                </div>
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="e.g. maps-leads or dentists"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rate limit / second</Label>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Template variable {"{{1}}"} maps to</Label>
              <Select value={var1} onChange={(e) => setVar1(e.target.value)}>
                <option value="name">Contact name</option>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading || !templates.length}>
            {loading ? "Creating…" : `Create Campaign (${matchingLeadsCount} Leads)`}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
