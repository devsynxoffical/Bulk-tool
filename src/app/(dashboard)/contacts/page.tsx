import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContactActions } from "@/components/contacts/contact-actions";
import { formatDistanceToNow } from "date-fns";

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your service audience. Message anyone individually or run campaigns."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/compose">
              <Button variant="outline">Start messaging</Button>
            </Link>
            <ContactActions />
          </div>
        }
      />

      {contacts.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Start messaging with a phone number — clients are saved automatically."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {c.name || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {c.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length
                          ? c.tags.map((t) => (
                              <Badge key={t} tone="default">
                                {t}
                              </Badge>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.optedOut ? (
                          <Badge tone="danger">Opted out</Badge>
                        ) : c.phone ? (
                          <Badge tone="success">WA</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.phone && !c.optedOut ? (
                          <Link
                            href={`/compose?phone=${encodeURIComponent(c.phone)}&name=${encodeURIComponent(c.name || "")}`}
                          >
                            <Button size="sm" variant="outline">
                              WhatsApp
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
