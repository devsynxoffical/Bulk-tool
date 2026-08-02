"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EmailAccount = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  hasPassword: boolean;
};

export function EmailForm() {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    void fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data: EmailAccount | null) => {
        if (!data) return;
        setAccount(data);
        setHost(data.host);
        setPort(data.port);
        setSecure(data.secure);
        setUsername(data.username);
        setFromEmail(data.fromEmail);
        setFromName(data.fromName ?? "");
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      host,
      port: Number(port),
      secure,
      username,
      fromEmail,
      fromName: fromName || undefined,
    };
    if (password) {
      body.password = password;
    } else if (!account?.hasPassword) {
      setMessage({ ok: false, text: "Please enter the SMTP password." });
      setSaving(false);
      return;
    }

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
        text: "Failed to save. Check the fields and try again.",
      });
      return;
    }
    setAccount(data);
    setPassword("");
    setMessage({ ok: true, text: "Email settings saved." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email sending (SMTP)</CardTitle>
        <CardDescription>
          Connect your email provider so campaigns can send bulk emails to the
          leads you collect. Use a provider app password (Gmail: Settings →
          Security → App passwords).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>SMTP host</Label>
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
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  account?.hasPassword
                    ? "Leave blank to keep current"
                    : "SMTP password / app password"
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>From email</Label>
              <Input
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>From name (optional)</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="My Service Business"
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
            Use SSL/TLS (port 465 usually)
          </label>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              <Mail className="h-4 w-4" />
              {saving ? "Saving…" : "Save email settings"}
            </Button>
            {message ? (
              <span
                className={
                  message.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"
                }
              >
                {message.text}
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
