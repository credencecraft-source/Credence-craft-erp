import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createOrderShare } from "@/lib/services/orders/order-share-service";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { orderId } = await params;
    const body = await request.json();
    const source = await requireOrganizationContext(user.id, String(body.sourceOrganizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const share = await createOrderShare({ orderId, sourceOrganizationId: source.id, sharedByUserId: user.id });
    return NextResponse.json({ ok: true, share });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to share order." }, { status: 400 });
  }
}
