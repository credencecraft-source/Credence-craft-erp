import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { GSTIN_PATTERN } from "@/lib/services/organizations/organization-validators";

const GST_CHECK_URL = process.env.GST_CHECK_URL || "https://sheet.gstincheck.co.in/check";
const GST_CHECK_API_KEY = process.env.GST_CHECK_API_KEY;

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

    if (!GST_CHECK_API_KEY) {
      return NextResponse.json({ valid: true, data: {} }, { status: 200 });
    }

    const response = await fetch(`${GST_CHECK_URL}/${GST_CHECK_API_KEY}/${gstNumber}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ valid: false, error: "GST verification service is unavailable. Please try again." }, { status: 502 });
    }

    const payload = await response.json();
    if (payload && payload.flag === true) {
      return NextResponse.json({ valid: true, data: payload.data || {} }, { status: 200 });
    }

    return NextResponse.json({ valid: false, error: "GST number could not be verified." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify GST details.";
    return NextResponse.json({ valid: false, error: message }, { status: 400 });
  }
}
