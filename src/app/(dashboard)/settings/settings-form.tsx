"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmailForm } from "@/components/settings/email-form";

type SessionState = {
  status: string;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  qrImage: string | null;
  connected: boolean;
};

function WhatsAppForm() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/settings/whatsapp");
        if (!res.ok) return;
        const data = (await res.json()) as SessionState;
        if (!cancelled) setSession(data);
      } catch {
        // ignore transient errors
      }
    }

    void refresh();
    const id = setInterval(() => void refresh(), 4000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function disconnect() {
    setLoggingOut(true);
    setMessage("");
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setLoggingOut(false);
    if (!res.ok) {
      setMessage("Failed to disconnect WhatsApp");
      return;
    }
    setMessage("Disconnected. A fresh QR code will appear to pair a new number.");
  }

  const status = session?.status ?? "DISCONNECTED";
  const tone =
    status === "CONNECTED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "SCANNING"
        ? "bg-amber-50 text-amber-700"
        : "bg-zinc-100 text-zinc-600";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp connection</CardTitle>
          <CardDescription>
            Links your WhatsApp number as a &quot;linked device&quot; — free, no Meta
            account or per-message charges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
            >
              {status === "CONNECTED"
                ? "Connected"
                : status === "SCANNING"
                  ? "Scan the QR code"
                  : status === "CONNECTING"
                    ? "Connecting…"
                    : "Not connected"}
            </span>
            {status === "CONNECTED" && session?.phoneNumber ? (
              <span className="text-sm font-medium text-zinc-800">
                +{session.phoneNumber}
              </span>
            ) : null}
          </div>

          {status === "SCANNING" && session?.qrImage ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-200 bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.qrImage}
                alt="WhatsApp QR code"
                className="h-56 w-56"
              />
              <ol className="max-w-sm list-decimal space-y-1 pl-4 text-sm text-zinc-600">
                <li>
                  Open <strong>WhatsApp</strong> on your phone
                </li>
                <li>Go to <strong>Settings → Linked devices</strong></li>
                <li>Tap <strong>Link a device</strong> and scan this code</li>
              </ol>
              <p className="text-[11px] text-zinc-400">
                The code refreshes automatically. Keep the worker process
                running while pairing.
              </p>
            </div>
          ) : null}

          {status === "CONNECTED" ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Messages sent and received through this number appear in the
                inbox instantly. Free-form messages can be sent anytime (no
                24-hour window or approved templates).
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={loggingOut}
                onClick={disconnect}
                className="text-red-600 hover:bg-red-50"
              >
                {loggingOut ? "Disconnecting…" : "Disconnect this number"}
              </Button>
            </div>
          ) : null}

          {!session?.qrImage && status === "SCANNING" ? (
            <p className="text-sm text-zinc-500">Waiting for QR code…</p>
          ) : null}

          {message ? (
            <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Before you start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          <p>
            This uses WhatsApp&apos;s unofficial web protocol (Baileys). It is free
            and reliable for normal usage, but automating messages technically
            violates WhatsApp&apos;s terms — WhatsApp can ban the linked number for
            spam. Keep your messages personal and moderate to stay safe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsClient() {
  return (
    <div className="space-y-6">
      <WhatsAppForm />
      <EmailForm />
    </div>
  );
}
