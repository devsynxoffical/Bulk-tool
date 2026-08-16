import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplatesList } from "./templates-list";

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({
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
