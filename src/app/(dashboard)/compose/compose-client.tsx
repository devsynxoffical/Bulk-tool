"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetEmail = searchParams.get("email");
  const presetName = searchParams.get("name");

  const [email, setEmail] = useState(presetEmail || "");
  const [name, setName] = useState(presetName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/chats/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "EMAIL", email: email.trim(), name: name || undefined }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Could not start email chat");
      return;
    }

    router.push(`/inbox?c=${data.conversationId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-md flex-col justify-center px-4">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <Mail className="h-7 w-7 text-blue-600" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Compose Direct Email
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start a 1-on-1 email conversation with a prospect or client.
        </p>
      </div>

      <form
        onSubmit={startChat}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4"
      >
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
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Contact name (optional)</Label>
          <Input
            id="name"
            placeholder="e.g. Sarah Jenkins"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error ? (
          <p className="rounded-md bg-red-50 p-2.5 text-xs text-red-700 font-medium">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {loading ? "Starting Email Chat…" : "Open Email Chat"}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
