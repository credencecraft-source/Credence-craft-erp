import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  getDevUserById,
  getDevUserByMobileNumber,
  setDevUser,
} from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import { verifyPlatformMobileOtpAccessToken } from "@/lib/services/platform/platform-mobile-otp-configuration-service";

const isDevBypass =
  process.env.NODE_ENV !== "production" &&
  (process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL);

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    if (isDevBypass) {
      const user = getDevUserById(sessionUser.id);
      return NextResponse.json({
        verified: Boolean(user?.mobile_verified_at),
      });
    }

    const user = await prisma.workspaceUser.findUnique({
      where: { id: sessionUser.id },
      select: { mobile_number: true, mobile_verified_at: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account is not available." }, { status: 404 });
    }

    return NextResponse.json({
      verified: Boolean(user.mobile_verified_at),
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: DATABASE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Unable to load mobile number settings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

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
      typeof body.accessToken !== "string"
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

    if (isDevBypass) {
      const conflict = getDevUserByMobileNumber(mobileNumber);
      if (conflict && conflict.id !== sessionUser.id) {
        return NextResponse.json(
          { error: "This mobile number is already linked to another account." },
          { status: 409 },
        );
      }

      const user = getDevUserById(sessionUser.id);
      if (!user) {
        return NextResponse.json({ error: "Account is not available." }, { status: 404 });
      }
      setDevUser({
        ...user,
        mobile_number: mobileNumber,
        mobile_verified_at: new Date(),
        updated_at: new Date(),
      });
    } else {
      const conflict = await prisma.workspaceUser.findUnique({
        where: { mobile_number: mobileNumber },
        select: { id: true },
      });
      if (conflict && conflict.id !== sessionUser.id) {
        return NextResponse.json(
          { error: "This mobile number is already linked to another account." },
          { status: 409 },
        );
      }

      try {
        await prisma.workspaceUser.update({
          where: { id: sessionUser.id },
          data: {
            mobile_number: mobileNumber,
            mobile_verified_at: new Date(),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(
            { error: "This mobile number is already linked to another account." },
            { status: 409 },
          );
        }
        throw error;
      }
    }

    return NextResponse.json({ ok: true, verified: true });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: DATABASE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Unable to save the verified mobile number." },
      { status: 502 },
    );
  }
}
