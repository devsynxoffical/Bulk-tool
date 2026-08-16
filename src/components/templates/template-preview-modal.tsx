"use client";

import { useMemo, useState } from "react";
import { Eye, Monitor, Paperclip, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type TemplatePreviewProps = {
  open: boolean;
  onClose: () => void;
  template: {
    name: string;
    subject?: string | null;
    body?: string | null;
    header?: string | null;
    footer?: string | null;
    pdfUrl?: string | null;
  };
};

export function TemplatePreviewModal({
  open,
  onClose,
  template,
}: TemplatePreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  // Sample variable values for realistic preview
  const interpolatedSubject = useMemo(() => {
    const raw = template.subject || "Message from DEVSYNX";
    return raw
      .replace(/\{\{name\}\}/gi, "John Doe")
      .replace(/\{\{email\}\}/gi, "john.doe@example.com")
      .replace(/\{\{company\}\}/gi, "Acme Inc")
      .replace(/\{\{1\}\}/gi, "John");
  }, [template.subject]);

  const interpolatedBody = useMemo(() => {
    const raw = template.body || "<p>No content provided</p>";
    return raw
      .replace(/\{\{name\}\}/gi, "John Doe")
      .replace(/\{\{email\}\}/gi, "john.doe@example.com")
      .replace(/\{\{company\}\}/gi, "Acme Inc")
      .replace(/\{\{1\}\}/gi, "John");
  }, [template.body]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-zinc-900 shadow-2xl overflow-hidden border border-zinc-800 text-zinc-100">
        {/* Modal Topbar Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5 bg-zinc-950">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">
              Email Template Preview — <span className="font-mono text-xs text-blue-400">{template.name}</span>
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Viewport Switcher */}
            <div className="flex items-center rounded-lg bg-zinc-800 p-1 border border-zinc-700">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewport === "desktop"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewport === "mobile"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile Phone
              </button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Modal Body Preview Area */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-6 flex justify-center items-start">
          <div
            className={`transition-all duration-300 ${
              viewport === "mobile"
                ? "w-[375px] rounded-[40px] border-[12px] border-zinc-800 bg-white shadow-2xl p-4 my-2 min-h-[640px]"
                : "w-full max-w-3xl rounded-xl border border-zinc-200 bg-white shadow-xl"
            }`}
          >
            {/* Email Header Component */}
            <div className="border-b border-zinc-100 bg-zinc-50/80 p-4 text-xs text-zinc-600 rounded-t-lg">
              <div className="space-y-1 font-sans">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-900 text-sm">
                    Subject: {interpolatedSubject}
                  </span>
                  {template.pdfUrl ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
                      <Paperclip className="h-3 w-3" />
                      PDF Attached
                    </span>
                  ) : null}
                </div>
                <p className="text-zinc-500">
                  <span className="font-medium text-zinc-700">From:</span> Sales Team &lt;onboarding@resend.dev&gt;
                </p>
                <p className="text-zinc-500">
                  <span className="font-medium text-zinc-700">To:</span> John Doe &lt;john.doe@example.com&gt;
                </p>
              </div>
            </div>

            {/* Email Content Body */}
            <div className="p-6 font-sans text-zinc-900 leading-relaxed text-sm bg-white min-h-[300px]">
              {template.header ? (
                <div className="mb-4 pb-2 border-b border-zinc-100 text-xs font-bold uppercase tracking-wider text-blue-600">
                  {template.header}
                </div>
              ) : null}

              {/* Render HTML content safely */}
              <div
                className="email-html-render text-zinc-900"
                dangerouslySetInnerHTML={{ __html: interpolatedBody }}
              />

              {template.footer ? (
                <div className="mt-8 pt-4 border-t border-zinc-100 text-xs text-zinc-400">
                  {template.footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-5 py-3 text-xs text-zinc-400">
          <span>Variables populated: <code className="text-blue-400 font-mono">name</code>, <code className="text-blue-400 font-mono">company</code>, <code className="text-blue-400 font-mono">email</code></span>
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
