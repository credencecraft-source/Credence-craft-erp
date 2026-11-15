import { NextResponse } from "next/server";

import { recordPlatformWhatsAppDeliveryCallback } from "@/lib/services/platform/platform-whatsapp-service";

function normalizeStatus(value: unknown) {
  if (typeof value !== "string") return "";
  const status = value.trim().toLowerCase();
  if (["sent", "accepted", "delivered", "read", "failed"].includes(status)) return status;
  return "";
}

function readCallbackToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-msg91-callback-token")?.trim() ?? "";
}

export async function POST(request: Request) {
  const callbackToken = readCallbackToken(request);
  if (!callbackToken) {
    return NextResponse.json({ error: "A delivery callback token is required." }, { status: 401 });
  }

  try {
    const payload: unknown = await request.json();
    const body = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : {};
    const data = typeof body.data === "object" && body.data !== null
      ? body.data as Record<string, unknown>
      : body;
    const requestId = data.request_id ?? data.requestId ?? data.message_id;
    const mobile = data.mobile ?? data.to ?? data.number;
    const status = normalizeStatus(data.status ?? data.delivery_status);
    if (typeof requestId !== "string" || typeof mobile !== "string" || !status) {
      return NextResponse.json(
        { error: "Callback must include request ID, mobile number, and a supported status." },
        { status: 400 },
      );
    }
    const result = await recordPlatformWhatsAppDeliveryCallback({
      callbackToken,
      requestId,
      mobile,
      status,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process delivery callback." },
      { status: 400 },
    );
  }
}
