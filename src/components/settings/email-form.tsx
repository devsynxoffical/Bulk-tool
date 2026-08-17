"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCode, Loader2, Mail, Send, Server, ShieldCheck, Sparkles, Plus, Trash2, Globe, RefreshCw, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
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
  dkimSelector?: string;
  dkimPublicKey?: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
  isVerified?: boolean;
  lastCheckedAt: string | null;
};

export function EmailForm() {
  const [activeSubTab, setActiveSubTab] = useState<"inboxes" | "domains" | "signature">("inboxes");
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

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
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data: { accounts: EmailAccount[] }) => {
        if (data && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
          if (data.accounts.length > 0) {
            const first = data.accounts[0];
            setSignature(first.signature || "");
          }
        }
      })
      .catch((err) => console.error("Error loading email accounts:", err));

    fetch("/api/domains")
      .then((r) => (r.ok ? r.json() : { domains: [] }))
      .then((data: { domains: DomainRecord[] }) => {
        if (data && Array.isArray(data.domains)) setDomains(data.domains);
      })
      .catch((err) => console.error("Error loading domains:", err));
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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
      const data = res.ok ? await res.json() : await res.json().catch(() => ({ error: "Server returned error status " + res.status }));
      setCheckingDomain(false);
      if (res.ok) {
        setNewDomain("");
        loadData();
      } else {
        alert(typeof data?.error === "string" ? data.error : "Domain check failed");
      }
    } catch (e) {
      setCheckingDomain(false);
      alert(e instanceof Error ? e.message : "Failed to check domain DNS");
    }
  }

  async function addAndAuditDomainForId(domainNameStr: string) {
    setCheckingDomain(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: domainNameStr }),
      });
      setCheckingDomain(false);
      loadData();
    } catch {
      setCheckingDomain(false);
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
              <CardDescription>Support Gmail, Outlook, cPanel, or custom SMTP servers</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveInbox} className="space-y-4">
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
              <CardDescription>
                Add your sending domain to view exact SPF, DKIM, DMARC, and MX DNS records required for high inbox deliverability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-950 space-y-1">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  In-House Cryptographic Domain Authentication (No Third Parties):
                </p>
                <p>
                  Enter your sending domain below to generate unique <strong>2048-bit RSA DKIM Keys</strong> (`dkim._domainkey`), <strong>SPF</strong> (`v=spf1 ...`), and <strong>DMARC</strong> records. Copy these TXT records to your DNS provider (Cloudflare, Namecheap, GoDaddy) to authenticate your domain for direct email sending.
                </p>
              </div>

              <form onSubmit={addAndAuditDomain} className="flex gap-2">
                <Input
                  placeholder="e.g. mycompany.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                />
                <Button type="submit" disabled={checkingDomain} className="bg-blue-600 hover:bg-blue-700">
                  {checkingDomain ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                  Connect &amp; Verify DNS
                </Button>
              </form>

              <div className="space-y-4">
                {domains.map((d) => {
                  const isExpanded = expandedDomain === d.id;
                  const selector = d.dkimSelector || "dkim";
                  const spfValue = `v=spf1 include:${d.domainName} ~all`;
                  const dmarcValue = `v=DMARC1; p=none; rua=mailto:dmarc@${d.domainName}`;
                  const dkimValue = d.dkimPublicKey
                    ? `v=DKIM1; k=rsa; p=${d.dkimPublicKey}`
                    : `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...`;
                  const mxValue = `mail.${d.domainName}`;

                  const verifiedCount = [d.spfVerified, d.dkimVerified, d.dmarcVerified, d.mxVerified].filter(Boolean).length;
                  const isFullyVerified = verifiedCount === 4;

                  return (
                    <div
                      key={d.id}
                      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-zinc-300 space-y-4"
                    >
                      {/* Header Row */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Globe className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-zinc-900">{d.domainName}</h3>
                              {isFullyVerified ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <Check className="h-3 w-3 mr-1" /> 100% Authenticated
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-900 border border-amber-200">
                                  ⚠️ Action Required ({verifiedCount}/4 Records)
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {d.lastCheckedAt ? `Last audited ${new Date(d.lastCheckedAt).toLocaleTimeString()}` : "DNS check pending"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-zinc-200 hover:bg-zinc-50"
                            onClick={() => addAndAuditDomainForId(d.domainName)}
                            disabled={checkingDomain}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkingDomain ? "animate-spin" : ""}`} />
                            Re-Verify DNS
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                            onClick={() => setExpandedDomain(isExpanded ? null : d.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                            {isExpanded ? "Hide DNS Records" : "View Required DNS Records"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDomain(d.id)}
                            className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Status Badges Grid */}
                      <div className="grid gap-3 sm:grid-cols-4 text-xs font-medium">
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            d.spfVerified
                              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                              : "bg-amber-50/80 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span><strong>SPF Record</strong></span>
                          <span>{d.spfVerified ? "✅ Verified" : "⚠️ Missing"}</span>
                        </div>
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            d.dkimVerified
                              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                              : "bg-amber-50/80 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span><strong>DKIM Key</strong></span>
                          <span>{d.dkimVerified ? "✅ Verified" : "⚠️ Pending"}</span>
                        </div>
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            d.dmarcVerified
                              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                              : "bg-amber-50/80 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span><strong>DMARC Record</strong></span>
                          <span>{d.dmarcVerified ? "✅ Verified" : "⚠️ Missing"}</span>
                        </div>
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            d.mxVerified
                              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                              : "bg-rose-50/80 border-rose-200 text-rose-900"
                          }`}
                        >
                          <span><strong>MX Record</strong></span>
                          <span>{d.mxVerified ? "✅ Verified" : "❌ No MX"}</span>
                        </div>
                      </div>

                      {/* Expandable Copyable DNS Records */}
                      {isExpanded && (
                        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/30 p-5 space-y-4 text-xs">
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-sm text-blue-950">
                              Copy &amp; Paste these 4 Records into your DNS Manager (Cloudflare, Namecheap, GoDaddy, cPanel):
                            </p>
                          </div>

                          <div className="space-y-3">
                            {/* 1. SPF */}
                            <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between text-zinc-800 font-medium">
                                <div className="flex items-center gap-2">
                                  <Badge tone="default" className="bg-zinc-100 text-zinc-700">TXT</Badge>
                                  <span>Host / Name: <code className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono font-bold text-zinc-900">@</code> (or <code>{d.domainName}</code>)</span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-zinc-200 hover:bg-zinc-50"
                                  onClick={() => copyToClipboard(spfValue, `spf_${d.id}`)}
                                >
                                  {copiedKey === `spf_${d.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  {copiedKey === `spf_${d.id}` ? "Copied!" : "Copy SPF TXT"}
                                </Button>
                              </div>
                              <div className="font-mono text-[11px] text-zinc-900 bg-zinc-50 p-2.5 rounded-md border border-zinc-200/80 break-all select-all">
                                {spfValue}
                              </div>
                            </div>

                            {/* 2. DMARC */}
                            <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between text-zinc-800 font-medium">
                                <div className="flex items-center gap-2">
                                  <Badge tone="default" className="bg-zinc-100 text-zinc-700">TXT</Badge>
                                  <span>Host / Name: <code className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono font-bold text-zinc-900">_dmarc</code></span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-zinc-200 hover:bg-zinc-50"
                                  onClick={() => copyToClipboard(dmarcValue, `dmarc_${d.id}`)}
                                >
                                  {copiedKey === `dmarc_${d.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  {copiedKey === `dmarc_${d.id}` ? "Copied!" : "Copy DMARC TXT"}
                                </Button>
                              </div>
                              <div className="font-mono text-[11px] text-zinc-900 bg-zinc-50 p-2.5 rounded-md border border-zinc-200/80 break-all select-all">
                                {dmarcValue}
                              </div>
                            </div>

                            {/* 3. DKIM 2048-bit Key */}
                            <div className="rounded-lg border border-blue-300 bg-white p-3.5 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between text-blue-950 font-medium">
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-blue-600 text-white">2048-bit RSA DKIM Key</Badge>
                                  <span>Host / Name: <code className="bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded font-mono font-bold">{selector}._domainkey</code></span>
                                </div>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => copyToClipboard(dkimValue, `dkim_${d.id}`)}
                                >
                                  {copiedKey === `dkim_${d.id}` ? (
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  {copiedKey === `dkim_${d.id}` ? "Copied Key!" : "Copy DKIM Key"}
                                </Button>
                              </div>
                              <div className="font-mono text-[11px] text-zinc-900 bg-zinc-50 p-3 rounded-md border border-zinc-200/80 leading-relaxed break-all select-all">
                                {dkimValue}
                              </div>
                              <p className="text-[10px] text-zinc-500 italic">
                                * This key is generated specifically for {d.domainName}. Copy the full value starting with <code>v=DKIM1; k=rsa; p=...</code>
                              </p>
                            </div>

                            {/* 4. MX Record */}
                            <div className="rounded-lg border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between text-zinc-800 font-medium">
                                <div className="flex items-center gap-2">
                                  <Badge tone="default" className="bg-zinc-100 text-zinc-700">MX</Badge>
                                  <span>Host / Name: <code className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono font-bold text-zinc-900">@</code> &bull; Priority: <code>10</code></span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-zinc-200 hover:bg-zinc-50"
                                  onClick={() => copyToClipboard(mxValue, `mx_${d.id}`)}
                                >
                                  {copiedKey === `mx_${d.id}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  {copiedKey === `mx_${d.id}` ? "Copied!" : "Copy MX Target"}
                                </Button>
                              </div>
                              <div className="font-mono text-[11px] text-zinc-900 bg-zinc-50 p-2.5 rounded-md border border-zinc-200/80 break-all select-all">
                                {mxValue}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
