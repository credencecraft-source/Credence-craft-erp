import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-manager";
import {
  getDevUserAccountByMobileNumber,
  setDevUser,
} from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import { isValidFullName, normalizeFullName } from "@/lib/auth/validation-rules";
import { verifyPlatformMobileOtpAccessToken } from "@/lib/services/platform/platform-mobile-otp-configuration-service";

const isDevBypass =
  process.env.NODE_ENV !== "production" &&
  (process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL);

function registeredMobileResponse() {
  return NextResponse.json(
    {
      error:
        "This mobile number is already registered. Request a new sign-in OTP to the email address on the account.",
    },
    { status: 409 },
  );
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

  try {
    if (
      !body ||
      typeof body !== "object" ||
      !("accessToken" in body) ||
      typeof body.accessToken !== "string" ||
      ("fullName" in body && typeof body.fullName !== "string")
    ) {
      return NextResponse.json(
        { error: "A verified MSG91 access token is required." },
        { status: 400 },
      );
    }

    const mobileNumber = await verifyPlatformMobileOtpAccessToken(
      body.accessToken,
    );
    if (!mobileNumber) {
      return NextResponse.json(
        { error: "Mobile verification failed. Request and verify a new OTP." },
        { status: 401 },
      );
    }
    const suppliedFullName = normalizeFullName(
      "fullName" in body && typeof body.fullName === "string"
        ? body.fullName
        : "",
    );
    if (suppliedFullName && !isValidFullName(suppliedFullName)) {
      return NextResponse.json(
        { error: "Enter a valid full name." },
        { status: 400 },
      );
    }
    const fullName = suppliedFullName || "Mobile User";

    let user:
      | {
          id: string;
          workspace_id: string;
          profile_name: string;
          full_name: string;
          email: string | null;
          mobile_verified_at?: Date | null;
        }
      | null;
    let isNewAccount = false;

    if (isDevBypass) {
      const devUser = getDevUserAccountByMobileNumber(mobileNumber);
      if (devUser) {
        return registeredMobileResponse();
      } else {
        const now = new Date();
        user = setDevUser({
          id: `dev-user-${randomUUID()}`,
          workspace_id: randomUUID(),
          profile_name: `mobile-${randomUUID()}`,
          full_name: fullName,
          email: null,
          email_verified: false,
          mobile_number: mobileNumber,
          mobile_verified_at: now,
          created_at: now,
          updated_at: now,
          last_login_at: now,
        });
        isNewAccount = true;
      }
    } else {
      user = await prisma.workspaceUser.findUnique({
        where: { mobile_number: mobileNumber },
        select: {
          id: true,
          workspace_id: true,
          profile_name: true,
          full_name: true,
          email: true,
          mobile_verified_at: true,
        },
      });

      if (user) return registeredMobileResponse();

      const now = new Date();
      try {
        user = await prisma.workspaceUser.create({
          data: {
            workspace_id: randomUUID(),
            profile_name: `mobile-${randomUUID()}`,
            full_name: fullName,
            email: null,
            email_verified: false,
            mobile_number: mobileNumber,
            mobile_verified_at: now,
            last_login_at: now,
          },
          select: {
            id: true,
            workspace_id: true,
            profile_name: true,
            full_name: true,
            email: true,
            mobile_verified_at: true,
          },
        });
        isNewAccount = true;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        user = await prisma.workspaceUser.findUnique({
          where: { mobile_number: mobileNumber },
          select: {
            id: true,
            workspace_id: true,
            profile_name: true,
            full_name: true,
            email: true,
            mobile_verified_at: true,
          },
        });
        if (!user) throw error;
        return registeredMobileResponse();
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "Unable to create or load the workspace account." },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      redirectTo: isNewAccount
        ? "/dashboard/organizations/create"
        : user.workspace_id
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
      { error: "Unable to verify mobile OTP. Please try again." },
      { status: 502 },
    );
  }
}
