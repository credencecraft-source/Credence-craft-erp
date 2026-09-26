import type { ReactNode } from "react";

import WorkspaceConfigurationSidebar from "./workspace-configuration-sidebar";

export default async function WorkspaceConfigurationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-2 py-4 sm:px-4 lg:flex-row lg:px-5 lg:py-8">
      <aside className="w-full shrink-0 lg:w-64">
        <WorkspaceConfigurationSidebar workspaceId={workspaceId} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}