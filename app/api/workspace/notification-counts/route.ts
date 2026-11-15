import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { countPendingInvitations } from "@/lib/services/organizations/organization-invitation-service";
import { countPendingOrderShares } from "@/lib/services/orders/order-share-service";

export async function GET() {
  const user = await requireSessionUser();
  const [invitations, orderShares] = await Promise.all([
    countPendingInvitations(user.id),
    countPendingOrderShares(user.id),
  ]);

  return NextResponse.json(
    { invitations, orderShares },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
