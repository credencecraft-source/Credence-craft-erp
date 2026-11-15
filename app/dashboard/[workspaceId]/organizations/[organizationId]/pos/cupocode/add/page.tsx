import PosCouponCreatePage from "../../_page-content/pos-coupon-create-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return <PosCouponCreatePage {...await params} />;
}
