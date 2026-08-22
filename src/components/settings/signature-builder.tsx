"use client";

import { useState } from "react";
import { Sparkles, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignatureBuilder() {
  const [signature, setSignature] = useState("");
  const [sigName, setSigName] = useState("");
  const [sigTitle, setSigTitle] = useState("");
  const [sigCompany, setSigCompany] = useState("");
  const [sigPhone, setSigPhone] = useState("");
  const [sigWebsite, setSigWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function generatePreset(style: "modern" | "corporate") {
    const name = sigName || "Your Name";
    const title = sigTitle || "Director";
    const company = sigCompany || "Company";
    const phone = sigPhone || "+1 555 0100";
    const website = sigWebsite || "https://example.com";

    if (style === "modern") {
      setSignature(`<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;">
  <strong>${name}</strong><br/>
  <span style="color:#2563eb;">${title} | ${company}</span><br/>
  <span style="font-size:12px;color:#64748b;">${phone} · <a href="${website}">${website.replace(/^https?:\/\//, "")}</a></span>
</div>`);
    } else {
      setSignature(`<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;">
  <strong>${name}</strong><br/>${title} · ${company}<br/>
  <span style="color:#64748b;font-size:12px;">${phone} | ${website}</span>
</div>`);
    }
  }

  async function saveToAllMailboxes() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/email");
      const data = await res.json();
      const accounts: { id: string }[] = data.accounts || [];
      if (accounts.length === 0) {
        setMessage("Add at least one mailbox first.");
        setSaving(false);
        return;
      }
      await Promise.all(
        accounts.map((acc) =>
          fetch("/api/settings/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: acc.id, signature }),
          }),
        ),
      );
      setMessage(`Signature saved to ${accounts.length} mailbox(es).`);
    } catch {
      setMessage("Failed to save signature.");
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">HTML Signature</CardTitle>
        <CardDescription>Appended to every outbound email from all mailboxes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => generatePreset("modern")}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Modern
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => generatePreset("corporate")}>
            Corporate
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Name" value={sigName} onChange={(e) => setSigName(e.target.value)} />
          <Input placeholder="Title" value={sigTitle} onChange={(e) => setSigTitle(e.target.value)} />
          <Input placeholder="Company" value={sigCompany} onChange={(e) => setSigCompany(e.target.value)} />
        </div>
        <Textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          className="font-mono text-xs"
          placeholder="HTML signature..."
        />
        {signature && (
          <div className="rounded-lg border bg-zinc-50 p-4" dangerouslySetInnerHTML={{ __html: signature }} />
        )}
        <Button onClick={saveToAllMailboxes} disabled={saving || !signature.trim()} className="bg-blue-600">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Save to All Mailboxes
        </Button>
        {message && <p className="text-xs text-zinc-600">{message}</p>}
      </CardContent>
    </Card>
  );
}
