import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-manager";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import {
  sendMobileAccountEmailOtp,
  verifyMobileAccountEmailOtp,
} from "@/lib/services/auth/mobile-email-otp-auth-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    !isRecord(body) ||
    typeof body.mobileNumber !== "string" ||
    !/^\d{7,15}$/.test(body.mobileNumber) ||
    (body.action !== "send" && body.action !== "verify")
  ) {
    return NextResponse.json(
      { error: "Enter a valid mobile number." },
      { status: 400 },
    );
  }

  try {
    if (body.action === "send") {
      const emailHint = await sendMobileAccountEmailOtp(body.mobileNumber);
      return NextResponse.json({
        ok: true,
        emailOtpSent: Boolean(emailHint),
        emailHint,
      });
    }

    if (typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) {
      return NextResponse.json(
        { error: "Enter the six-digit email OTP." },
        { status: 400 },
      );
    }

    const user = await verifyMobileAccountEmailOtp(
      body.mobileNumber,
      body.otp,
    );
    if (!user) {
      return NextResponse.json(
        { error: "The email OTP is invalid or expired. Check the code and try again." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      redirectTo: user.workspace_id
        ? `/dashboard/${user.workspace_id}/home`
        : "/dashboard",
    });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: createSessionToken(user.id),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: DATABASE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Unable to complete email verification. Please try again." },
      { status: 500 },
    );
  }
}
