import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { requirePageSession } from "@/lib/page-auth";
import { TemplatesList } from "./templates-list";

export default async function TemplatesPage() {
  const { scope } = await requirePageSession();
  const templates = await prisma.template.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description="Saved email templates with live deliverability and spam score analysis."
        actions={<TemplateActions />}
      />
      <TemplatesList templates={templates} />
    </div>
  );
}
