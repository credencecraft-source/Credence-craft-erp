import FactoryManagementStagePage from "./factory-management-stage-page";
import Link from "next/link";
import Card from "@/components/ui/Card";
import WorkOrderForm from "./work-order-form";

export default function FactoryManagementWorkOrderPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return <WorkOrderDashboardPage params={params} />;
}

async function WorkOrderDashboardPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return (
    <FactoryManagementStagePage
      params={params}
      area="Pre Production"
      title="Work Order"
      description="Review created work orders or start a new production work order."
      content={<Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/work-orders`} className="block"><Card className="border-slate-200 transition hover:border-emerald-300 hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Work Order</p><h2 className="mt-3 text-xl font-bold text-slate-900">Work orders</h2><p className="mt-2 text-sm text-slate-600">View all created work orders, size-wise quantities, totals, and status.</p><span className="mt-6 inline-block text-sm font-semibold text-emerald-700">Open work orders -&gt;</span></Card></Link>}
    />
  );
}
