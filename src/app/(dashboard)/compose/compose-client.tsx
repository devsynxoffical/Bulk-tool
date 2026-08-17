"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Send, Sparkles, CheckCircle2, AlertCircle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type TemplateItem = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetEmail = searchParams.get("email");
  const presetName = searchParams.get("name");

  const [email, setEmail] = useState(presetEmail || "");
  const [name, setName] = useState(presetName || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data: { templates: TemplateItem[] }) => {
        if (data && Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      })
      .catch(() => {});
  }, []);

  function handleSelectTemplate(e: React.ChangeEvent<HTMLSelectElement>) {
    const tId = e.target.value;
    setSelectedTemplateId(tId);
    if (!tId) return;
    const found = templates.find((t) => t.id === tId);
    if (found) {
      if (found.subject) setSubject(found.subject);
      if (found.body) setBody(found.body);
    }
  }

  function insertVar(varName: string) {
    setBody((prev) => prev + ` {{${varName}}}`);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !subject.trim() || !body.trim()) {
      setStatusMessage({ ok: false, text: "Please fill out Email, Subject, and Email Body." });
      return;
    }

    setSending(true);
    setStatusMessage(null);

    try {
      // 1. Ensure contact exists or create contact
      const contactRes = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const contactData = await contactRes.json();
      if (!contactRes.ok || !contactData.contact?.id) {
        throw new Error(contactData.error || "Failed to resolve contact");
      }

      // 2. Dispatch email message via multi-inbox rotation & DKIM
      const sendRes = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contactData.contact.id,
          subject: subject.trim(),
          body: body.trim(),
          templateId: selectedTemplateId || undefined,
        }),
      });

      const sendData = await sendRes.json();
      setSending(false);

      if (!sendRes.ok) {
        throw new Error(sendData.error || "Failed to dispatch email");
      }

      setStatusMessage({ ok: true, text: "Email dispatched successfully via round-robin mailbox!" });
      setTimeout(() => {
        router.push("/emails");
        router.refresh();
      }, 1200);
    } catch (err) {
      setSending(false);
      setStatusMessage({
        ok: false,
        text: err instanceof Error ? err.message : "An error occurred while sending",
      });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Compose &amp; Dispatch Direct Cold Email
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Send high-deliverability 1-on-1 cold outreach signed with 2048-bit RSA DKIM.
          </p>
        </div>
        <Badge tone="default" className="bg-blue-50 text-blue-900 border border-blue-200">
          <Sparkles className="h-3 w-3 mr-1 text-blue-600" />
          Multi-Inbox Rotation Enabled
        </Badge>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2.5 rounded-xl border p-4 text-xs font-medium ${
            statusMessage.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {statusMessage.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Composer Card */}
      <form onSubmit={handleSendEmail} className="rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xs space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-zinc-800">Recipient Email Address *</Label>
            <Input
              type="email"
              placeholder="prospect@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-zinc-800">Recipient Name (Optional)</Label>
            <Input
              type="text"
              placeholder="e.g. Sarah Jenkins"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        {/* Template Selector */}
        {templates.length > 0 && (
          <div className="space-y-1.5 border-t border-zinc-100 pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                Load Saved Template
              </Label>
            </div>
            <select
              value={selectedTemplateId}
              onChange={handleSelectTemplate}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select an Email Template to Autofill --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.subject})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subject Line */}
        <div className="space-y-1.5 border-t border-zinc-100 pt-4">
          <Label className="text-xs font-bold text-zinc-800">Subject Line *</Label>
          <Input
            type="text"
            placeholder="Quick question about {{company}}..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>

        {/* Variable Insertion Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-zinc-400">Insert Variable Tag:</span>
          {["name", "company", "phone", "email"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="rounded-md border border-blue-200 bg-blue-50/60 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100 transition"
            >
              + {`{{${v}}}`}
            </button>
          ))}
        </div>

        {/* Body Editor */}
        <div className="space-y-1.5 pt-2">
          <Label className="text-xs font-bold text-zinc-800">Email Message Body *</Label>
          <Textarea
            rows={8}
            placeholder="Hi {{name}},&#10;&#10;I noticed your recent work at {{company}}..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="font-sans text-xs leading-relaxed"
            required
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <p className="text-[11px] text-zinc-500">
            Every outgoing email is digitally signed with your domain's DKIM private key.
          </p>
          <Button
            type="submit"
            disabled={sending}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            {sending ? "Dispatching..." : "Send Email Now"}
          </Button>
        </div>
      </form>
    </div>
  );
}
