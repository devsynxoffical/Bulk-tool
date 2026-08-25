import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersManager } from "./users-client";

export const metadata = {
  title: "Users | DEVSYNX Suite",
  description: "Create and manage platform users with isolated workspaces.",
};

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return <UsersManager />;
}
