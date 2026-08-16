import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ContactsClient } from "@/components/contacts/contacts-client";

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const serializedContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    tags: c.tags,
    optedOut: c.optedOut,
    emailOptedOut: c.emailOptedOut,
    customFields: (c.customFields as Record<string, unknown> | null) ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Clients & Leads"
        description="Select, filter, and manage all your imported leads and clients for bulk WhatsApp and Email messaging."
      />

      <ContactsClient initialContacts={serializedContacts} />
    </div>
  );
}
