import { notFound } from "next/navigation";

import { ERP_MODULES } from "@/components/erp/erp-config-registry";

export default async function ErpModuleOverviewPage({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}) {
  const { moduleKey } = await params;
  const module = ERP_MODULES.find((entry) => entry.pathSegment === moduleKey);

  if (!module) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-2 p-6">
      <p className="erp-eyebrow">ERP Module</p>
      <h1 className="text-2xl font-bold text-slate-900">{module.label}</h1>
      <p className="text-sm text-slate-600">
        {module.label} is enabled for this organization.
      </p>
    </div>
  );
}