"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCode, Loader2, Mail, Send, Server, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  hasPassword: boolean;
};

export function EmailForm() {
  const [provider, setProvider] = useState<"RESEND" | "SMTP">("RESEND");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  // Email Signature state
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
    void fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data: EmailAccount | null) => {
        if (!data) return;
        setProvider(data.provider || "RESEND");
        setApiKey(data.apiKey || "");
        setHasApiKey(Boolean(data.hasApiKey));
        setHost(data.host || "");
        setPort(data.port || 587);
        setSecure(Boolean(data.secure));
        setUsername(data.username || "");
        setFromEmail(data.fromEmail || "");
        setFromName(data.fromName ?? "");
        setSignature(data.signature ?? "");
      });
  }, []);

  function generateSignaturePreset(style: "modern" | "corporate" | "clean") {
    const name = sigName || fromName || "Syed Hassan";
    const title = sigTitle || "Sales Director";
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
        <img src="${logo}" width="60" height="60" style="border-radius: 50%; object-fit: cover;" alt="${name}" />
      </td>
      <td style="vertical-align: top; border-left: 2px solid #2563eb; padding-left: 14px;">
        <div style="font-size: 16px; font-weight: bold; color: #0f172a;">${name}</div>
        <div style="font-size: 13px; color: #2563eb; font-weight: 500; margin-bottom: 6px;">${title} | ${company}</div>
        <div style="font-size: 12px; color: #64748b; line-height: 1.5;">
          📞 <strong>Phone:</strong> ${phone}<br/>
          🌐 <strong>Web:</strong> <a href="${website}" style="color: #2563eb; text-decoration: none;">${website.replace(/^https?:\/\//, "")}</a>
        </div>
      </td>
    </tr>
  </table>
</div>`;
    } else if (style === "corporate") {
      html = `<div style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #334155;">
  <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${name}</div>
  <div style="color: #475569; font-weight: 600; margin-bottom: 4px;">${title} &bull; ${company}</div>
  <div style="height: 1px; background-color: #cbd5e1; width: 100%; margin: 8px 0;"></div>
  <div style="color: #64748b; font-size: 12px;">
    <span>Direct: ${phone}</span> &nbsp;|&nbsp; 
    <span><a href="${website}" style="color: #0284c7; text-decoration: none;">${website.replace(/^https?:\/\//, "")}</a></span>
  </div>
</div>`;
    } else {
      html = `<div style="font-family: Georgia, serif; font-size: 14px; color: #1c1917;">
  <p style="margin: 0; font-weight: bold; font-size: 15px;">${name}</p>
  <p style="margin: 2px 0 6px 0; color: #78716c; font-style: italic; font-size: 13px;">${title}, ${company}</p>
  <p style="margin: 0; font-size: 12px; color: #57534e;">m: ${phone} &bull; e: ${fromEmail || "hello@domain.com"}</p>
</div>`;
    }

    setSignature(html);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      provider,
      fromEmail,
      fromName: fromName || undefined,
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
          text: typeof data.error === "string" ? data.error : "Failed to save email settings.",
        });
        return;
      }

      setHasApiKey(Boolean(data.hasApiKey));
      if (data.apiKey) setApiKey(data.apiKey);
      setPassword("");
      setMessage({ ok: true, text: "Email settings & Signature saved successfully." });
    } catch {
      setSaving(false);
      setMessage({ ok: false, text: "An error occurred while saving." });
    }
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
          text: `Test email sent successfully to ${data.sentTo}! Check your inbox.`,
        });
      }
    } catch {
      setTesting(false);
      setMessage({ ok: false, text: "Test email request failed." });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Email Delivery Settings</CardTitle>
              <CardDescription>
                Configure Resend API (Recommended) or custom SMTP to send emails for campaigns & leads.
              </CardDescription>
            </div>
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setProvider("RESEND")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  provider === "RESEND"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                Resend API (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setProvider("SMTP")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  provider === "SMTP"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Server className="h-3.5 w-3.5 text-zinc-600" />
                SMTP Server
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            {provider === "RESEND" ? (
              <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Resend API Key</Label>
                    <a
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline hover:text-blue-800"
                    >
                      Get API Key on Resend.com
                    </a>
                  </div>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasApiKey ? "•••••••••••• (Key Configured)" : "re_123456789..."}
                    required={!hasApiKey}
                    className="font-mono"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Resend provides high deliverability email sending with zero setup.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Sender Email Address (From)</Label>
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="onboarding@resend.dev or hello@yourdomain.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sender Name (From Name)</Label>
                    <Input
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="My Company"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>SMTP Host</Label>
                    <Input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="smtp.gmail.com"
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
                    <Label>Username</Label>
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
                      placeholder="SMTP Password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sender Email Address</Label>
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="you@domain.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sender Name</Label>
                    <Input
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="My Company"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Use SSL/TLS (Port 465)
                </label>
              </div>
            )}

            {/* Signature Builder Section */}
            <div className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                    <FileCode className="h-4 w-4 text-purple-600" />
                    HTML Email Signature
                  </h4>
                  <p className="text-xs text-zinc-500">
                    Automatically appended to the bottom of all outgoing email campaigns and direct messages.
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => generateSignaturePreset("modern")}
                  >
                    <Sparkles className="h-3 w-3 text-purple-600" />
                    Modern Preset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => generateSignaturePreset("corporate")}
                  >
                    Corporate Preset
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder="Your Name (e.g. Syed Hassan)"
                  value={sigName}
                  onChange={(e) => setSigName(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Job Title (e.g. Founder & CEO)"
                  value={sigTitle}
                  onChange={(e) => setSigTitle(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Company (e.g. DEVSYNX)"
                  value={sigCompany}
                  onChange={(e) => setSigCompany(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Phone Number"
                  value={sigPhone}
                  onChange={(e) => setSigPhone(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Website URL"
                  value={sigWebsite}
                  onChange={(e) => setSigWebsite(e.target.value)}
                  className="text-xs"
                />
                <Input
                  placeholder="Logo / Photo Image URL"
                  value={sigLogo}
                  onChange={(e) => setSigLogo(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-600">HTML Signature Markup</Label>
                <Textarea
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="<div style='font-family: Arial...'>Best regards,<br/><b>Your Name</b></div>"
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>

              {signature ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-zinc-500">Live Signature Preview</Label>
                  <div
                    className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 shadow-xs"
                    dangerouslySetInnerHTML={{ __html: signature }}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {saving ? "Saving…" : `Save ${provider === "RESEND" ? "Resend" : "SMTP"} Settings & Signature`}
              </Button>

              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="Test email address"
                  value={testEmailTarget}
                  onChange={(e) => setTestEmailTarget(e.target.value)}
                  className="w-48 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={sendTestEmail}
                  disabled={testing || (!hasApiKey && provider === "RESEND")}
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-blue-600" />}
                  Send Test Email
                </Button>
              </div>
            </div>

            {message ? (
              <div
                className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                  message.ok
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : null}
                <span>{message.text}</span>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
