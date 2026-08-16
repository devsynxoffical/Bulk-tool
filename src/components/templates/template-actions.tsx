"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TemplateActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setOpen((v) => !v)}>
        <FilePlus2 className="h-4 w-4" />
        New template
      </Button>

      {open ? (
        <Card className="mt-2 w-full">
          <CardHeader>
            <CardTitle>New template</CardTitle>
            <CardDescription>
              WhatsApp templates use {"{{1}}"}, {"{{2}}"}… variables. Email
              templates can use {"{{name}}"}, {"{{email}}"} and custom fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value as "WHATSAPP" | "EMAIL")
                    }
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Hi {{name}}, special offer for you"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                      PDF Attachment URL (Optional)
                    </Label>
                    <Input
                      type="url"
                      value={pdfUrl}
                      onChange={(e) => setPdfUrl(e.target.value)}
                      placeholder="https://example.com/brochure.pdf"
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>{channel === "EMAIL" ? "Email body (HTML)" : "Message body"}</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    channel === "EMAIL"
                      ? "<p>Hi {{name}},</p><p>Please find attached our company catalog.</p>"
                      : "Hi {{1}}, enjoy our latest offer…"
                  }
                  required
                  className="min-h-[140px] font-mono text-xs"
                />
              </div>

              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving…" : "Create template"}
                </Button>
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
    </div>
  );
}
