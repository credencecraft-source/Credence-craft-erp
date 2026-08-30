import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-session";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return <>{children}</>;
}