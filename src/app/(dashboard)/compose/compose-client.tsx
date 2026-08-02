"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPhone = searchParams.get("phone");
  const presetName = searchParams.get("name");

  const [phone, setPhone] = useState(presetPhone || "");
  const [name, setName] = useState(presetName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/chats/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "WHATSAPP", phone, name: name || undefined }),
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
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00a884]/15">
          <MessageCircle className="h-7 w-7 text-[#00a884]" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Start new messaging
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Enter a number and open a chat — just like WhatsApp.
        </p>
      </div>

      <form
        onSubmit={startChat}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
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

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className="mt-5 h-11 w-full bg-[#00a884] text-white hover:bg-[#06cf9c]"
        >
          {loading ? "Starting…" : "Start messaging"}
          {!loading ? <ArrowRight className="h-4 w-4" /> : null}
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
