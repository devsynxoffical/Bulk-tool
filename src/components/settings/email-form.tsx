"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCode, Loader2, Mail, Send, Server, ShieldCheck, Sparkles, Plus, Trash2, Globe, RefreshCw, AlertCircle } from "lucide-react";
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

type EmailAccount = {
  id: string;
  provider: "RESEND" | "SMTP";
  apiKey: string;
  hasApiKey: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  signature?: string;
  dailyLimit: number;
  sentToday: number;
  healthScore: number;
  isActive: boolean;
  hasPassword: boolean;
};

type DomainRecord = {
  id: string;
  domainName: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
  lastCheckedAt: string | null;
};

export function EmailForm() {
  const [activeSubTab, setActiveSubTab] = useState<"inboxes" | "domains" | "signature">("inboxes");
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"RESEND" | "SMTP">("SMTP");
  const [apiKey, setApiKey] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(50);

  // Domain form state
  const [newDomain, setNewDomain] = useState("");
  const [checkingDomain, setCheckingDomain] = useState(false);

  // Signature state
  const [signature, setSignature] = useState("");
  const [sigName, setSigName] = useState("");
  const [sigTitle, setSigTitle] = useState("");
  const [sigCompany, setSigCompany] = useState("");
  const [sigPhone, setSigPhone] = useState("");
  const [sigWebsite, setSigWebsite] = useState("");
  const [sigLogo, setSigLogo] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailTarget, setTestEmailTarget] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data: { accounts: EmailAccount[] }) => {
        if (data.accounts && data.accounts.length > 0) {
          setAccounts(data.accounts);
          const first = data.accounts[0];
          setSignature(first.signature || "");
        }
      });

    fetch("/api/domains")
      .then((r) => r.json())
      .then((data: { domains: DomainRecord[] }) => {
        if (data.domains) setDomains(data.domains);
      });
  }

  async function saveInbox(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      id: editingId || undefined,
      provider,
      fromEmail,
      fromName: fromName || undefined,
      dailyLimit: Number(dailyLimit) || 50,
      signature,
    };

    if (provider === "RESEND") {
      body.apiKey = apiKey;
    } else {
      body.host = host;
      body.port = Number(port);
      body.secure = secure;
      body.username = username;
      if (password) body.password = password;
    }

    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSaving(false);

      if (!res.ok) {
        setMessage({
          ok: false,
          text: typeof data.error === "string" ? data.error : "Failed to save inbox account.",
        });
        return;
      }

      setMessage({ ok: true, text: "Inbox saved successfully for multi-inbox rotation." });
      resetForm();
      loadData();
    } catch {
      setSaving(false);
      setMessage({ ok: false, text: "An error occurred while saving." });
    }
  }

  async function deleteInbox(id: string) {
    if (!confirm("Are you sure you want to remove this inbox?")) return;
    await fetch(`/api/settings/email?id=${id}`, { method: "DELETE" });
    loadData();
  }

  function resetForm() {
    setEditingId(null);
    setProvider("SMTP");
    setApiKey("");
    setHost("");
    setPort(587);
    setSecure(false);
    setUsername("");
    setPassword("");
    setFromEmail("");
    setFromName("");
    setDailyLimit(50);
  }

  async function addAndAuditDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;

    setCheckingDomain(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: newDomain.trim() }),
      });
      const data = await res.json();
      setCheckingDomain(false);
      if (res.ok) {
        setNewDomain("");
        loadData();
      } else {
        alert(data.error || "Domain check failed");
      }
    } catch {
      setCheckingDomain(false);
      alert("Failed to check domain DNS");
    }
  }

  async function deleteDomain(id: string) {
    await fetch(`/api/domains?id=${id}`, { method: "DELETE" });
    loadData();
  }

  async function sendTestEmail() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmailTarget || undefined }),
      });
      const data = await res.json();
      setTesting(false);
      if (!res.ok) {
        setMessage({ ok: false, text: `Test failed: ${data.error}` });
      } else {
        setMessage({
          ok: true,
          text: `Test email sent successfully to ${data.sentTo}!`,
        });
      }
    } catch {
      setTesting(false);
      setMessage({ ok: false, text: "Test email request failed." });
    }
  }

  function generateSignaturePreset(style: "modern" | "corporate") {
    const name = sigName || fromName || "Syed Hassan";
    const title = sigTitle || "Director of Outreach";
    const company = sigCompany || "DEVSYNX";
    const phone = sigPhone || "+1 (555) 019-2834";
    const website = sigWebsite || "https://example.com";
    const logo = sigLogo || "https://lh3.googleusercontent.com/a/default-user";

    let html = "";
    if (style === "modern") {
      html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; max-width: 450px;">
  <table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="vertical-align: top; padding-right: 14px;">
        <img src="${logo}" width="56" height="56" style="border-radius: 50%; object-fit: cover;" alt="${name}" />
      </td>
      <td style="vertical-align: top; border-left: 2px solid #2563eb; padding-left: 14px;">
        <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${name}</div>
        <div style="font-size: 13px; color: #2563eb; font-weight: 500; margin-bottom: 4px;">${title} | ${company}</div>
        <div style="font-size: 12px; color: #64748b;">
          Direct: ${phone}<br/>
          Web: <a href="${website}" style="color: #2563eb; text-decoration: none;">${website.replace(/^https?:\/\//, "")}</a>
        </div>
      </td>
    </tr>
  </table>
</div>`;
    } else {
      html = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #334155;">
  <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${name}</div>
  <div style="color: #475569; font-weight: 600; margin-bottom: 4px;">${title} &bull; ${company}</div>
  <div style="height: 1px; background-color: #cbd5e1; width: 100%; margin: 6px 0;"></div>
  <div style="color: #64748b; font-size: 12px;">
    <span>m: ${phone}</span> &nbsp;|&nbsp; 
    <span><a href="${website}" style="color: #0284c7; text-decoration: none;">${website.replace(/^https?:\/\//, "")}</a></span>
  </div>
</div>`;
    }

    setSignature(html);
  }

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-zinc-200 gap-6">
        <button
          onClick={() => setActiveSubTab("inboxes")}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeSubTab === "inboxes"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          📮 Connected Inboxes ({accounts.length})
        </button>
        <button
          onClick={() => setActiveSubTab("domains")}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeSubTab === "domains"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          🌐 Domain &amp; DNS Verification ({domains.length})
        </button>
        <button
          onClick={() => setActiveSubTab("signature")}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeSubTab === "signature"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          ✍️ Email Signature Builder
        </button>
      </div>

      {/* 1. Multi-Inbox Tab */}
      {activeSubTab === "inboxes" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Active Sending Mailboxes</CardTitle>
                <CardDescription>
                  Inboxes are rotated automatically using round-robin to protect deliverability.
                </CardDescription>
              </div>
              <Button onClick={resetForm} size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-1" /> Add Mailbox
              </Button>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                  No sending inboxes connected yet. Add an SMTP or Resend mailbox below to begin sending.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="rounded-lg border border-zinc-200 bg-white p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          <span className="font-semibold text-sm text-zinc-900">{acc.fromEmail}</span>
                        </div>
                        <Badge tone="default" className="text-xs">
                          {acc.provider}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>Daily Limit: <strong>{acc.sentToday} / {acc.dailyLimit}</strong> sent</span>
                        <span>Health: <strong className="text-emerald-600">{acc.healthScore}%</strong></span>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => deleteInbox(acc.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add / Edit Inbox Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                {editingId ? "Edit Mailbox Account" : "Connect New Sending Mailbox"}
              </CardTitle>
              <CardDescription>Support Gmail, Outlook, Resend, or custom SMTP servers</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveInbox} className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={provider === "SMTP" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setProvider("SMTP")}
                  >
                    <Server className="h-3.5 w-3.5 mr-1" /> Custom SMTP Server
                  </Button>
                  <Button
                    type="button"
                    variant={provider === "RESEND" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setProvider("RESEND")}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Resend API
                  </Button>
                </div>

                {provider === "SMTP" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>SMTP Host</Label>
                      <Input
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="smtp.gmail.com or smtp.office365.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        placeholder="587"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Username / Mailbox Email</Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="you@domain.com"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Password / App Password</Label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Resend API Key</Label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="re_123456789..."
                      required
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>From Email Address</Label>
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="sales@company.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>From Name</Label>
                    <Input
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Syed Hassan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Daily Send Cap</Label>
                    <Input
                      type="number"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      placeholder="50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                    Save Mailbox to Rotation Pool
                  </Button>

                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder="Send test to..."
                      value={testEmailTarget}
                      onChange={(e) => setTestEmailTarget(e.target.value)}
                      className="w-44 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={sendTestEmail} disabled={testing}>
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                      Test Send
                    </Button>
                  </div>
                </div>

                {message && (
                  <div className={`p-3 rounded-md text-xs ${message.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                    {message.text}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. Domain & DNS Tab */}
      {activeSubTab === "domains" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Connect &amp; Audit Sending Domains</CardTitle>
              <CardDescription>Verify SPF, DKIM, and DMARC DNS records to guarantee inbox placement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addAndAuditDomain} className="flex gap-2">
                <Input
                  placeholder="e.g. mycompany.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                />
                <Button type="submit" disabled={checkingDomain} className="bg-blue-600 hover:bg-blue-700">
                  {checkingDomain ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                  Audit DNS Records
                </Button>
              </form>

              <div className="space-y-3">
                {domains.map((d) => (
                  <div key={d.id} className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-600" />
                        <span className="font-bold text-sm text-zinc-900">{d.domainName}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteDomain(d.id)} className="h-7 text-xs text-rose-600">
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-4 text-xs">
                      <div className={`p-2 rounded-md border ${d.spfVerified ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                        <strong>SPF:</strong> {d.spfVerified ? "✅ Verified" : "⚠️ Missing v=spf1"}
                      </div>
                      <div className={`p-2 rounded-md border ${d.dkimVerified ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                        <strong>DKIM:</strong> {d.dkimVerified ? "✅ Verified" : "⚠️ Missing Selector"}
                      </div>
                      <div className={`p-2 rounded-md border ${d.dmarcVerified ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                        <strong>DMARC:</strong> {d.dmarcVerified ? "✅ Verified" : "⚠️ Missing _dmarc TXT"}
                      </div>
                      <div className={`p-2 rounded-md border ${d.mxVerified ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                        <strong>MX:</strong> {d.mxVerified ? "✅ Verified" : "❌ No MX Record"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. Signature Builder Tab */}
      {activeSubTab === "signature" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">HTML Signature Builder</CardTitle>
            <CardDescription>Appended automatically to every outbound email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => generateSignaturePreset("modern")}>
                <Sparkles className="h-3.5 w-3.5 mr-1 text-purple-600" /> Modern Preset
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => generateSignaturePreset("corporate")}>
                Corporate Preset
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="Your Name" value={sigName} onChange={(e) => setSigName(e.target.value)} />
              <Input placeholder="Job Title" value={sigTitle} onChange={(e) => setSigTitle(e.target.value)} />
              <Input placeholder="Company" value={sigCompany} onChange={(e) => setSigCompany(e.target.value)} />
            </div>

            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="HTML markup will appear here..."
              rows={4}
              className="font-mono text-xs"
            />

            {signature && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4" dangerouslySetInnerHTML={{ __html: signature }} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
