import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ContactsClient } from "@/components/contacts/contacts-client";

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const serializable = contacts.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    email: c.email,
    tags: c.tags,
    optedOut: c.optedOut,
    emailOptedOut: c.emailOptedOut,
    customFields:
      c.customFields && typeof c.customFields === "object"
        ? (c.customFields as Record<string, unknown>)
        : null,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Client Database &amp; Leads"
        description="Manage imported scraped leads, verify email statuses, and organize audience tags."
      />
      <ContactsClient initialContacts={serializable} />
    </div>
  );
}
