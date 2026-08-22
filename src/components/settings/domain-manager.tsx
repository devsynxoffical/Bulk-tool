"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_DOMAIN_DAILY_LIMIT,
  RECOMMENDED_DOMAIN_COUNT,
  SYSTEM_DAILY_TARGET,
} from "@/lib/email/constants";

type DomainRecord = {
  id: string;
  domainName: string;
  dkimSelector?: string;
  dkimPublicKey?: string;
  spfRecordHint?: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
  isVerified?: boolean;
  dailyLimit: number;
  sentToday: number;
  mailboxCount: number;
  lastCheckedAt: string | null;
};

export function DomainManager() {
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/domains")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load domains");
        return r.json();
      })
      .then((data: { domains: DomainRecord[] }) => {
        if (Array.isArray(data.domains)) setDomains(data.domains);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function addDomain(e: React.FormEvent) {
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
        alert(data.error || "Failed to add domain");
      }
    } catch {
      setCheckingDomain(false);
      alert("Network error");
    }
  }

  async function reverify(domainName: string) {
    setCheckingDomain(true);
    await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainName }),
    });
    setCheckingDomain(false);
    loadData();
  }

  async function deleteDomain(id: string) {
    if (!confirm("Remove this domain? DKIM keys will be deleted.")) return;
    await fetch(`/api/domains?id=${id}`, { method: "DELETE" });
    loadData();
  }

  const verifiedCount = domains.filter((d) => d.isVerified).length;

  return (
    <div className="space-y-6">
      <Card className="border-indigo-200 bg-indigo-50/40">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm font-bold text-zinc-900">Multi-Domain Setup for {SYSTEM_DAILY_TARGET.toLocaleString()}/day</p>
          <p className="mt-1 text-xs text-zinc-600">
            Add <strong>{RECOMMENDED_DOMAIN_COUNT} domains</strong> · ~4 mailboxes each ·{" "}
            {DEFAULT_DOMAIN_DAILY_LIMIT}/domain/day · {verifiedCount}/{domains.length} fully authenticated
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sending Domains</CardTitle>
          <CardDescription>
            Root domain only (e.g. <code>company.com</code>). Generates 2048-bit DKIM keys and audits DNS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Anti-spam checklist per domain
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>SPF, DKIM, DMARC all verified before bulk sends</li>
              <li>Max 1,000 emails/day per domain (4 inboxes × 250)</li>
              <li>Use unique From names per inbox on the same domain</li>
              <li>Warm up new inboxes for 3+ weeks before full volume</li>
            </ul>
          </div>

          <form onSubmit={addDomain} className="flex gap-2">
            <Input
              placeholder="e.g. mycompany.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
            <Button type="submit" disabled={checkingDomain} className="bg-blue-600 hover:bg-blue-700 shrink-0">
              {checkingDomain ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4 mr-1" />}
              Add Domain
            </Button>
          </form>

          <div className="space-y-4">
            {domains.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">No domains added yet.</p>
            )}
            {domains.map((d) => {
              const isExpanded = expandedDomain === d.id;
              const selector = d.dkimSelector || "dkim";
              const spfValue = d.spfRecordHint || `v=spf1 a mx include:mail.${d.domainName} ~all`;
              const dmarcValue = `v=DMARC1; p=none; rua=mailto:dmarc@${d.domainName}`;
              const dkimValue = d.dkimPublicKey
                ? `v=DKIM1; k=rsa; p=${d.dkimPublicKey}`
                : "Generate keys by adding domain";
              const mxValue = `mail.${d.domainName}`;
              const authCount = [d.spfVerified, d.dkimVerified, d.dmarcVerified].filter(Boolean).length;

              return (
                <div key={d.id} className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Globe className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold">{d.domainName}</h3>
                          <Badge tone={authCount === 3 ? "success" : "warning"}>
                            {authCount === 3 ? "Authenticated" : `${authCount}/3 DNS`}
                          </Badge>
                          <Badge tone="default">{d.mailboxCount} mailboxes</Badge>
                        </div>
                        <p className="text-xs text-zinc-500">
                          {d.sentToday}/{d.dailyLimit} sent today
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => reverify(d.domainName)} disabled={checkingDomain}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checkingDomain ? "animate-spin" : ""}`} />
                        Re-verify
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setExpandedDomain(isExpanded ? null : d.id)}>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        DNS Records
                      </Button>
                      <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => deleteDomain(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-4 text-xs">
                    {[
                      ["SPF", d.spfVerified],
                      ["DKIM", d.dkimVerified],
                      ["DMARC", d.dmarcVerified],
                      ["MX", d.mxVerified],
                    ].map(([label, ok]) => (
                      <div
                        key={label as string}
                        className={`p-2 rounded-lg border ${ok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}
                      >
                        {label}: {ok ? "✓" : "Pending"}
                      </div>
                    ))}
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 text-xs">
                      {[
                        { key: "spf", label: "SPF (@)", value: spfValue },
                        { key: "dmarc", label: "_dmarc", value: dmarcValue },
                        { key: "dkim", label: `${selector}._domainkey`, value: dkimValue },
                        { key: "mx", label: "MX @ priority 10", value: mxValue },
                      ].map((rec) => (
                        <div key={rec.key} className="rounded-lg border bg-zinc-50 p-3">
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">{rec.label}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => copyToClipboard(rec.value, `${rec.key}_${d.id}`)}
                            >
                              {copiedKey === `${rec.key}_${d.id}` ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              Copy
                            </Button>
                          </div>
                          <code className="block break-all text-[11px]">{rec.value}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
