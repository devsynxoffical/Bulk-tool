"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FilePlus2, LayoutTemplate, Loader2, Paperclip, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { analyzeEmailSpamScore } from "@/lib/email/spam-checker";

export function TemplateActions() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("EMAIL");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setUploading(false);

      if (!res.ok) {
        setError(data.error || "Failed to upload file");
        return;
      }

      setPdfUrl(data.url);
      setPdfName(data.originalName || file.name);
    } catch {
      setUploading(false);
      setError("File upload failed. Please try again.");
    }
  }

  function insertPreset(preset: "promo" | "newsletter" | "corporate" | "outreach") {
    if (preset === "promo") {
      setName("modern_promo_offer");
      setSubject("Exclusive Special Offer for {{name}} — Up to 30% Off");
      setBody(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 32px 24px; text-align: center; color: #ffffff;">
    <h1 style="margin: 0; font-size: 24px; font-weight: bold;">Special Offer for {{name}}</h1>
    <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Exclusive partner invitation from DEVSYNX</p>
  </div>
  <div style="padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6;">Hi <strong>{{name}}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      We are excited to share our latest premium service packages tailored for <strong>{{company}}</strong>. Upgrade today and receive a 30% discount on your first campaign.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="https://example.com" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 14px;">Claim Your Discount &rarr;</a>
    </div>
    <p style="font-size: 13px; color: #64748b;">If you have any questions, feel free to reply directly to this email.</p>
  </div>
</div>`);
    } else if (preset === "newsletter") {
      setName("monthly_product_newsletter");
      setSubject("{{company}} Monthly Newsletter & Product Updates");
      setBody(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; border: 1px solid #e2e8f0; border-radius: 8px; p-6;">
  <div style="padding: 20px; border-bottom: 2px solid #2563eb;">
    <h2 style="color: #0f172a; margin: 0;">Product Highlights & Release Notes</h2>
  </div>
  <div style="padding: 20px;">
    <p>Hello <strong>{{name}}</strong>,</p>
    <p>Here are the latest tools and performance upgrades available for your team:</p>
    <ul style="line-height: 1.8; color: #475569;">
      <li>⚡ <strong>10x Faster Scraper Engine:</strong> Parallel browser page pool extractions.</li>
      <li>✉️ <strong>Resend API Integration:</strong> High deliverability email sending.</li>
      <li>📎 <strong>PDF Attachments:</strong> Direct proposal document attachments.</li>
    </ul>
  </div>
</div>`);
    } else if (preset === "corporate") {
      setName("corporate_announcement");
      setSubject("Important Service Update for {{name}}");
      setBody(`<div style="font-family: Georgia, serif; max-width: 580px; margin: 0 auto; color: #1c1917; line-height: 1.7;">
  <h2 style="color: #0c4a6e;">Service Announcement</h2>
  <p>Dear {{name}},</p>
  <p>We are pleased to inform you regarding scheduled performance improvements to our service infrastructure for {{company}}.</p>
  <p>All core bulk messaging queues, scraper tools, and email delivery routes are operating at peak efficiency.</p>
  <p style="margin-top: 24px;">Sincerely,<br/><strong>The Executive Team</strong></p>
</div>`);
    } else {
      setName("cold_outreach_letter");
      setSubject("Quick question regarding {{company}}");
      setBody(`<div style="font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
  <p>Hi {{name}},</p>
  <p>I hope this email finds you well.</p>
  <p>I noticed <strong>{{company}}</strong> is actively expanding outreach operations. We help businesses automate bulk WhatsApp and Email outreach with 10x speed.</p>
  <p>Would you be open for a quick 5-minute call this week?</p>
  <p>Best regards,</p>
</div>`);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        name,
        category,
        subject: subject || undefined,
        body,
        pdfUrl: pdfUrl || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to create");
      return;
    }

    setOpen(false);
    setName("");
    setSubject("");
    setBody("");
    setPdfUrl("");
    setPdfName("");
    router.refresh();
  }

  const spamScore = analyzeEmailSpamScore(subject, body);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setOpen((v) => !v)}>
        <FilePlus2 className="h-4 w-4" />
        New template
      </Button>

      {open ? (
        <Card className="mt-2 w-full">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>New Template</CardTitle>
                <CardDescription>
                  WhatsApp templates use {"{{1}}"}, {"{{2}}"}… variables. Email
                  templates can use {"{{name}}"}, {"{{email}}"} and custom fields.
                </CardDescription>
              </div>

              {channel === "EMAIL" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Live Preview Template
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value as "WHATSAPP" | "EMAIL")
                    }
                  >
                    <option value="EMAIL">Email</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Template Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="service_offer"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="MARKETING"
                    required
                  />
                </div>
              </div>

              {channel === "EMAIL" ? (
                <div className="space-y-4">
                  {/* HTML Design Presets Toolbar */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                        1-Click HTML Design Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs bg-white"
                          onClick={() => insertPreset("promo")}
                        >
                          <LayoutTemplate className="h-3 w-3 text-blue-600" />
                          Modern Promo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs bg-white"
                          onClick={() => insertPreset("newsletter")}
                        >
                          Newsletter
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs bg-white"
                          onClick={() => insertPreset("corporate")}
                        >
                          Corporate
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs bg-white"
                          onClick={() => insertPreset("outreach")}
                        >
                          Outreach
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Live Spam & Deliverability Score Widget */}
                  <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    spamScore.score >= 85
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : spamScore.score >= 65
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}>
                    <div>
                      <span className="font-bold">Deliverability Score: {spamScore.score}/100</span> ({spamScore.rating})
                      {spamScore.warnings.length > 0 && (
                        <p className="mt-0.5 opacity-85">⚠️ {spamScore.warnings[0]}</p>
                      )}
                    </div>
                    <span className="font-semibold text-xs px-2 py-0.5 rounded bg-white/70">
                      {spamScore.score >= 85 ? "Inbox Ready" : "Optimization Recommended"}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Subject Line</Label>
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Hi {{name}}, special offer for {{company}}"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                          PDF File Attachment
                        </span>
                      </Label>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />

                      {pdfUrl ? (
                        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-xs font-medium text-blue-900">
                          <div className="flex items-center gap-1.5 truncate">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            <span className="truncate">{pdfName || pdfUrl}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPdfUrl("");
                              setPdfName("");
                            }}
                            className="ml-2 text-blue-600 hover:text-blue-900"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="w-full flex items-center justify-center gap-2 border-dashed border-zinc-300 text-xs text-zinc-700 hover:border-blue-400 hover:bg-blue-50/40"
                        >
                          {uploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5 text-blue-600" />
                          )}
                          {uploading ? "Uploading PDF…" : "Upload PDF File from Device"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>{channel === "EMAIL" ? "Email Body (HTML)" : "Message Body"}</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    channel === "EMAIL"
                      ? "<p>Hi {{name}},</p><p>Please find attached our company catalog.</p>"
                      : "Hi {{1}}, enjoy our latest offer…"
                  }
                  required
                  rows={8}
                  className="font-mono text-xs"
                />
              </div>

              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={loading || uploading}>
                  {loading ? "Saving…" : "Create Template"}
                </Button>
                {channel === "EMAIL" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye className="h-4 w-4" />
                    Preview Email
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Modal Live Preview */}
      <TemplatePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        template={{
          name: name || "new_template",
          subject,
          body,
          pdfUrl,
        }}
      />
    </div>
  );
}
