import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateActions } from "@/components/templates/template-actions";

function statusTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING" || status === "IN_APPEAL") return "warning" as const;
  return "danger" as const;
}

function channelTone(channel: string) {
  return channel === "WHATSAPP" ? ("whatsapp" as const) : ("info" as const);
}

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Saved message templates for WhatsApp and email campaigns."
        actions={<TemplateActions />}
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Create a template or run the database seed to load samples."
          action={<TemplateActions />}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate font-mono text-xs">
                    {t.name}
                  </CardTitle>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {t.language} · {t.category}
                    {t.subject ? ` · ${t.subject}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex gap-1">
                    <Badge tone={channelTone(t.channel)}>{t.channel}</Badge>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </div>
                  {t.isSample ? <Badge>Sample</Badge> : null}
                </div>
              </CardHeader>
              <CardContent>
                {t.header ? (
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    {t.header}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {t.body || "No body preview"}
                </p>
                {t.footer ? (
                  <p className="mt-2 text-[11px] text-zinc-400">{t.footer}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
