"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPhone = searchParams.get("phone");
  const presetEmail = searchParams.get("email");
  const presetName = searchParams.get("name");

  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">(
    presetPhone && !presetEmail ? "WHATSAPP" : "EMAIL"
  );
  const [phone, setPhone] = useState(presetPhone || "");
  const [email, setEmail] = useState(presetEmail || "");
  const [name, setName] = useState(presetName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload =
      channel === "EMAIL"
        ? { channel: "EMAIL", email, name: name || undefined }
        : { channel: "WHATSAPP", phone, name: name || undefined };

    const res = await fetch("/api/chats/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Could not start chat");
      return;
    }

    router.push(`/inbox?c=${data.conversationId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          {channel === "EMAIL" ? (
            <Mail className="h-7 w-7 text-blue-600" />
          ) : (
            <MessageCircle className="h-7 w-7 text-[#00a884]" />
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Start new conversation
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Compose direct Email or WhatsApp messages.
        </p>
      </div>

      <div className="mb-4 flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setChannel("EMAIL")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
            channel === "EMAIL"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <Mail className="h-4 w-4 text-blue-600" />
          Email (Resend)
        </button>
        <button
          type="button"
          onClick={() => setChannel("WHATSAPP")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
            channel === "WHATSAPP"
              ? "bg-white text-zinc-900 shadow-xs"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <MessageCircle className="h-4 w-4 text-[#00a884]" />
          WhatsApp
        </button>
      </div>

      <form
        onSubmit={startChat}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4"
      >
        {channel === "EMAIL" ? (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              placeholder="client@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 text-base"
            />
            <p className="text-[11px] text-zinc-400">
              Emails will be delivered via your configured Resend API
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoFocus
              autoComplete="tel"
              placeholder="+923001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="h-11 text-base"
            />
            <p className="text-[11px] text-zinc-400">
              Include country code (e.g. +92 for Pakistan, +1 for US)
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className={`h-11 w-full text-white ${
            channel === "WHATSAPP"
              ? "bg-[#00a884] hover:bg-[#06cf9c]"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "Starting…" : `Start ${channel === "WHATSAPP" ? "WhatsApp" : "Email"} Chat`}
          {!loading ? <ArrowRight className="h-4 w-4 ml-1" /> : null}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => router.push("/inbox")}
        className="mt-4 text-center text-sm text-zinc-500 hover:text-zinc-800 cursor-pointer"
      >
        Back to chats
      </button>
    </div>
  );
}
