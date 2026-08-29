import { NextResponse } from "next/server";

import {
  DEV_OTP,
  isValidEmail,
  isValidFullName,
  isValidProfileName,
  normalizeEmail,
  normalizeFullName,
  normalizeProfileName,
} from "@/lib/auth-validation";
import { getDevUser, hasDevProfileName } from "@/lib/dev-user-store";
import { prisma } from "@/lib/prisma";

const USE_DEV_USER_STORE = process.env.USE_DEV_USER_STORE === "true";
const isDevBypass =
  USE_DEV_USER_STORE ||
  !process.env.DATABASE_URL;

async function getUserByEmail(email: string) {
  if (isDevBypass) {
    return getDevUser(email);
  }

  try {
    return await prisma.workspaceUser.findUnique({
      where: { email },
    });
  } catch {
    return null;
  }
}

async function getUserByProfileName(profileName: string) {
  if (isDevBypass) {
    return hasDevProfileName(profileName) ? { profile_name: profileName } : null;
  }

  try {
    return await prisma.workspaceUser.findUnique({
      where: { profile_name: profileName },
    });
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const fullName = normalizeFullName(body.fullName);
    const profileName = normalizeProfileName(body.profileName);
    const mode = String(body.mode || "login").trim();

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!process.env.DATABASE_URL && !isDevBypass) {
      return NextResponse.json(
        {
          error:
            "Database is not configured. Set DATABASE_URL and run prisma migrate before enabling production registration.",
        },
        { status: 500 }
      );
    }

    const existingUser = await getUserByEmail(email);

    if (mode === "register") {
      if (!isValidFullName(fullName) || !isValidProfileName(profileName)) {
        return NextResponse.json(
          { error: "Full name and profile name are required and must be valid." },
          { status: 400 }
        );
      }

      if (existingUser) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }

      const existingProfile = await getUserByProfileName(profileName);
      if (existingProfile) {
        return NextResponse.json(
          { error: "Profile name already exists." },
          { status: 409 }
        );
      }

      return NextResponse.json({
        ok: true,
        userExists: false,
        ...(isDevBypass ? { devMode: true, devOtp: DEV_OTP } : {}),
        message: "OTP sent.",
      });
    }

    if (mode !== "login") {
      return NextResponse.json(
        { error: "Invalid authentication mode." },
        { status: 400 }
      );
    }

    if (!existingUser) {
      return NextResponse.json(
        {
          error: "No account found. Please register first.",
          needsRegistration: true,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      userExists: true,
      ...(isDevBypass ? { devMode: true, devOtp: DEV_OTP } : {}),
      message: "OTP sent.",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to send OTP." },
      { status: 500 }
    );
  }
}