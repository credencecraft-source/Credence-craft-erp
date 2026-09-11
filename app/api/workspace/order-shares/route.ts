import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { acceptOrderShare, listPendingOrderShares, rejectOrderShare } from "@/lib/services/orders/order-share-service";

export async function GET() {
  const user = await requireSessionUser();
  return NextResponse.json({ shares: await listPendingOrderShares(user.id) });
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    if (!body.shareId || !["accept", "reject"].includes(body.action)) {
      return NextResponse.json({ error: "Share id and action are required." }, { status: 400 });
    }
    if (body.action === "reject") {
      await rejectOrderShare(String(body.shareId), user.id);
      return NextResponse.json({ ok: true });
    }
    if (!body.destinationOrganizationId) {
      return NextResponse.json({ error: "Select the organization that should receive this order." }, { status: 400 });
    }
    const result = await acceptOrderShare({ shareId: String(body.shareId), workspaceUserId: user.id, destinationOrganizationId: String(body.destinationOrganizationId) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process order share." }, { status: 400 });
  }
}
