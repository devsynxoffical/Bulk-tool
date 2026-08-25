"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Shield, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "AGENT";
  isActive: boolean;
  createdAt: string;
  _count?: {
    emailAccounts: number;
    sendingDomains: number;
    campaigns: number;
    contacts: number;
  };
};

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"AGENT" | "ADMIN">("AGENT");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.status === 403) {
        setMessage({ ok: false, text: "Admin only — you cannot manage users." });
        setUsers([]);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          ok: false,
          text: typeof data.error === "string" ? data.error : "Create failed",
        });
        return;
      }
      setMessage({
        ok: true,
        text: `Created ${data.user?.email} — they get their own domains & mailboxes.`,
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("AGENT");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(
    id: string,
    patch: { isActive?: boolean; role?: "ADMIN" | "AGENT" },
  ) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({
        ok: false,
        text: typeof data.error === "string" ? data.error : "Update failed",
      });
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
          <Users className="h-5 w-5 text-blue-600" />
          Users
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create agents with isolated data — each gets separate domains, mailboxes,
          campaigns, and contacts. Only admins can manage users.
        </p>
      </div>

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            Create user
          </CardTitle>
          <CardDescription>
            New users start as Agent with an empty workspace (add their own
            domains &amp; mailboxes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Agent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "AGENT" | "ADMIN")}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="AGENT">Agent (own data only)</option>
                <option value="ADMIN">Admin (see all + manage users)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Create user
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-zinc-500">No users found.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900">{u.name}</p>
                      <Badge tone={u.role === "ADMIN" ? "info" : "default"}>
                        {u.role === "ADMIN" ? (
                          <span className="inline-flex items-center gap-1">
                            <Shield className="h-3 w-3" /> ADMIN
                          </span>
                        ) : (
                          "AGENT"
                        )}
                      </Badge>
                      {!u.isActive && <Badge tone="warning">Disabled</Badge>}
                    </div>
                    <p className="truncate text-xs text-zinc-500">{u.email}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {u._count?.sendingDomains ?? 0} domains ·{" "}
                      {u._count?.emailAccounts ?? 0} mailboxes ·{" "}
                      {u._count?.campaigns ?? 0} campaigns ·{" "}
                      {u._count?.contacts ?? 0} contacts
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void patchUser(u.id, { isActive: !u.isActive })
                      }
                    >
                      {u.isActive ? "Disable" : "Enable"}
                    </Button>
                    {u.role === "AGENT" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchUser(u.id, { role: "ADMIN" })}
                      >
                        Make admin
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void patchUser(u.id, { role: "AGENT" })}
                      >
                        Make agent
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
