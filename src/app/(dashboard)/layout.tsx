import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/top-header";
import { ChatAwareMain } from "@/components/layout/chat-aware-main";
import { SessionProvider } from "@/components/providers/session-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen overflow-hidden bg-zinc-50">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopHeader
            userName={session.user.name}
            userEmail={session.user.email}
            userRole={session.user.role}
          />
          <ChatAwareMain>{children}</ChatAwareMain>
        </div>
      </div>
    </SessionProvider>
  );
}
