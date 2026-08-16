"use client";

import { useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Upload, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VerifierResult {
  email: string;
  isValid: boolean;
  status: "VALID" | "INVALID" | "RISKY";
  reason: string;
  mxHost?: string;
  hasMxRecord: boolean;
}

export default function EmailVerifierPage() {
  const [singleEmail, setSingleEmail] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkSocket, setCheckSocket] = useState(true);
  const [results, setResults] = useState<VerifierResult[]>([]);
  const [singleResult, setSingleResult] = useState<VerifierResult | null>(null);

  async function handleVerifySingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleEmail.trim()) return;

    setLoading(true);
    setSingleResult(null);

    try {
      const res = await fetch("/api/email-verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: singleEmail.trim(), checkSocket }),
      });
      const data = await res.json();
      if (res.ok) {
        setSingleResult(data);
      } else {
        alert(data.error || "Verification failed");
      }
    } catch {
      alert("Network error running verification");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyBulk() {
    const emails = bulkText
      .split(/[\n,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    if (emails.length === 0) {
      alert("Please enter or paste at least one valid email address.");
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const res = await fetch("/api/email-verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, checkSocket }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
      } else {
        alert(data.error || "Bulk verification failed");
      }
    } catch {
      alert("Error executing bulk verification");
    } finally {
      setLoading(false);
    }
  }

  const validList = results.filter((r) => r.isValid && r.status === "VALID");
  const riskyList = results.filter((r) => r.status === "RISKY");
  const invalidList = results.filter((r) => !r.isValid);

  function exportValidCsv() {
    if (validList.length === 0) return;
    const content = "email,status,mx_host,reason\n" + validList.map((r) => `"${r.email}","${r.status}","${r.mxHost || ""}","${r.reason}"`).join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verified_valid_emails_${Date.now()}.csv`;
    a.click();
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-zinc-50/50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              In-House Email Verifier & Lead Validator
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Verify scraped leads with zero third-party subscription cost. Checks DNS MX records &amp; direct TCP socket handshakes.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Single Email Verifier */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Single Email Verification</CardTitle>
              <CardDescription>Instant MX and mailbox availability check</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifySingle} className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="e.g. founder@company.com"
                    value={singleEmail}
                    onChange={(e) => setSingleEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Verify"}
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkSocket}
                    onChange={(e) => setCheckSocket(e.target.checked)}
                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enable Port 25 Socket Handshake (Deeper verification)
                </label>

                {singleResult && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-zinc-900">{singleResult.email}</span>
                      {singleResult.status === "VALID" && (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> VALID
                        </Badge>
                      )}
                      {singleResult.status === "RISKY" && (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                          <AlertTriangle className="h-3 w-3 mr-1" /> RISKY
                        </Badge>
                      )}
                      {singleResult.status === "INVALID" && (
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200">
                          <XCircle className="h-3 w-3 mr-1" /> INVALID
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">Reason: {singleResult.reason}</p>
                    {singleResult.mxHost && (
                      <p className="text-[11px] text-zinc-400">MX Exchange: {singleResult.mxHost}</p>
                    )}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Bulk Email List Verifier */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Bulk Scraped List Verifier</CardTitle>
              <CardDescription>Paste multiple scraped emails (one per line)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="john@company.com&#10;sarah@startup.io&#10;sales@agency.org"
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <Button
                  onClick={handleVerifyBulk}
                  disabled={loading || !bulkText.trim()}
                  className="bg-zinc-900 hover:bg-zinc-800"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Verifying List…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" /> Bulk Verify Scraped List
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Table */}
        {results.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Bulk Verification Results</CardTitle>
                <CardDescription>
                  Total: {results.length} | Valid: <span className="text-emerald-600 font-semibold">{validList.length}</span> | Risky: <span className="text-amber-600 font-semibold">{riskyList.length}</span> | Invalid: <span className="text-rose-600 font-semibold">{invalidList.length}</span>
                </CardDescription>
              </div>
              <Button onClick={exportValidCsv} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4 text-emerald-600" /> Export Valid CSV ({validList.length})
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto rounded-md border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-100 font-semibold text-zinc-700">
                    <tr>
                      <th className="p-3">Email Address</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">MX Exchange</th>
                      <th className="p-3">Verification Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white">
                    {results.map((r, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/50">
                        <td className="p-3 font-medium text-zinc-900">{r.email}</td>
                        <td className="p-3">
                          {r.status === "VALID" && (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">VALID</Badge>
                          )}
                          {r.status === "RISKY" && (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200">RISKY</Badge>
                          )}
                          {r.status === "INVALID" && (
                            <Badge className="bg-rose-50 text-rose-700 border-rose-200">INVALID</Badge>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-zinc-500">{r.mxHost || "-"}</td>
                        <td className="p-3 text-zinc-500">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
