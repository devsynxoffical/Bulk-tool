import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateActions } from "@/components/templates/template-actions";
import { TemplatesList } from "./templates-list";

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Saved message templates for WhatsApp and Email campaigns."
        actions={<TemplateActions />}
      />
      <TemplatesList templates={templates} />
    </div>
  );
}
