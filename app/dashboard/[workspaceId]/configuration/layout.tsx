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
    <div className="workspace-configuration-layout mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 lg:flex-row lg:p-8">
      <aside className="w-full shrink-0 lg:w-64">
        <WorkspaceConfigurationSidebar workspaceId={workspaceId} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}