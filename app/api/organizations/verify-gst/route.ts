import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { GSTIN_PATTERN } from "@/lib/services/organizations/organization-validators";
import { fetchGstRegistration, GstVerificationError } from "@/lib/services/organizations/gst-verification-service";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const gstNumber = String(body?.gstNumber || "").trim().toUpperCase();

    if (!gstNumber) {
      return NextResponse.json({ valid: false, error: "GST number is required." }, { status: 400 });
    }

    if (!GSTIN_PATTERN.test(gstNumber)) {
      return NextResponse.json({ valid: false, error: "GST number must be in valid GSTIN format." }, { status: 400 });
    }

    const data = await fetchGstRegistration(gstNumber);
    return NextResponse.json({ valid: true, data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify GST details.";
    const status = error instanceof GstVerificationError ? error.statusCode : 502;
    return NextResponse.json({ valid: false, error: message }, { status });
  }
}
