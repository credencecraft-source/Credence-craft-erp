import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation-rules";
import {
  createOrganizationEmailVerificationToken,
  ORGANIZATION_EMAIL_VERIFICATION_COOKIE,
} from "@/lib/services/organizations/organization-email-verification-service";
import { issueEmailOtp, verifyEmailOtp } from "@/lib/services/platform/platform-email-configuration-service";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid verification request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid verification request." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  const mode = typeof input.mode === "string" ? input.mode : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  if (mode === "send") {
    try {
      await issueEmailOtp(email, "ORGANIZATION_EMAIL");
      return NextResponse.json({ ok: true, message: "Verification code sent." });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Too many OTP requests.")) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 429 });
      }
      console.error("Organization email verification email delivery failed.");
      return NextResponse.json(
        { ok: false, error: "Unable to send the verification code. Please try again." },
        { status: 503 },
      );
    }
  }

  if (mode === "verify") {
    const otp = typeof input.otp === "string" ? input.otp.trim() : "";
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit verification code." }, { status: 400 });
    }

    let otpIsValid: boolean;
    try {
      otpIsValid = await verifyEmailOtp(email, otp, "ORGANIZATION_EMAIL");
    } catch {
      console.error("Organization email verification code check failed.");
      return NextResponse.json(
        { ok: false, error: "Unable to verify the code. Please try again." },
        { status: 503 },
      );
    }
    if (!otpIsValid) {
      return NextResponse.json({ ok: false, error: "Invalid or expired verification code." }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(
      ORGANIZATION_EMAIL_VERIFICATION_COOKIE,
      createOrganizationEmailVerificationToken(user.id, email),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      },
    );
    return NextResponse.json({ ok: true, message: "Email verified." });
  }

  return NextResponse.json({ ok: false, error: "Invalid verification action." }, { status: 400 });
}
