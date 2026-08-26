"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Copy,
  Check,
  Eye,
  EyeOff,
  Shield,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Default seeded admin — always shown on login for easy access. */
const ADMIN_CREDENTIALS = {
  email: "admin@example.com",
  password: "ChangeMe123!",
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>(ADMIN_CREDENTIALS.email);
  const [password, setPassword] = useState<string>(ADMIN_CREDENTIALS.password);
  const [showPassword, setShowPassword] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(
    null,
  );

  async function copyText(value: string, which: "email" | "password" | "both") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // ignore clipboard failures
    }
  }

  function useAdminCredentials() {
    setEmail(ADMIN_CREDENTIALS.email);
    setPassword(ADMIN_CREDENTIALS.password);
    setShowPassword(true);
    setError("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10">
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.28),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(79,70,229,0.18),_transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-900/40">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            DEVSYNX Email Suite
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            Cold outreach engine — sign in to continue
          </p>
        </div>

        {/* Always-visible admin credentials */}
        <div className="mb-4 overflow-hidden rounded-2xl border border-blue-400/25 bg-blue-950/40 shadow-xl shadow-blue-950/30 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 border-b border-blue-400/15 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-200">
              <Shield className="h-3.5 w-3.5" />
              Admin login credentials
            </div>
            <button
              type="button"
              onClick={() =>
                void copyText(
                  `${ADMIN_CREDENTIALS.email}\n${ADMIN_CREDENTIALS.password}`,
                  "both",
                )
              }
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-200/90 transition hover:bg-blue-500/20 hover:text-white"
            >
              {copied === "both" ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy both
            </button>
          </div>

          <div className="space-y-3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300/70">
                  Email
                </p>
                <p className="mt-0.5 truncate font-mono text-sm font-medium text-white">
                  {ADMIN_CREDENTIALS.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyText(ADMIN_CREDENTIALS.email, "email")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-blue-100 transition hover:bg-white/10"
                title="Copy email"
              >
                {copied === "email" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300/70">
                  Password
                </p>
                <p className="mt-0.5 break-all font-mono text-sm font-medium text-white">
                  {ADMIN_CREDENTIALS.password}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void copyText(ADMIN_CREDENTIALS.password, "password")
                }
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-blue-100 transition hover:bg-white/10"
                title="Copy password"
              >
                {copied === "password" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={useAdminCredentials}
              className="w-full border-blue-400/30 bg-blue-500/10 text-blue-50 hover:bg-blue-500/20 hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Fill form with admin credentials
            </Button>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/40"
        >
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition hover:text-zinc-700"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="mt-5 w-full bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in as Admin"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-500">
          Default seed account. Change it in Railway env vars{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">
            ADMIN_EMAIL
          </code>{" "}
          /{" "}
          <code className="rounded bg-white/5 px-1 text-zinc-400">
            ADMIN_PASSWORD
          </code>{" "}
          after first login if needed.
        </p>
      </div>
    </div>
  );
}
