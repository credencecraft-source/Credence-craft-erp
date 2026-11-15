import { notFound } from "next/navigation";

import ShopFloorOperationPage from "../../../_page-content/shop-floor-operation-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    process: string;
    logId: string;
  }>;
  searchParams: Promise<{ workOrderId?: string | string[] }>;
}) {
  const [{ workspaceId, organizationId, process, logId }, { workOrderId }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (typeof workOrderId !== "string" || !workOrderId) notFound();

  return (
    <ShopFloorOperationPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      processSlug={process}
      workOrderId={workOrderId}
      recordId={logId}
      recordType="operation"
    />
  );
}
