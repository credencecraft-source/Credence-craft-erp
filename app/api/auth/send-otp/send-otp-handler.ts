import { NextResponse } from "next/server";

import {
  isValidEmail,
  isValidFullName,
  isValidProfileName,
  normalizeEmail,
  normalizeFullName,
  normalizeProfileName,
} from "@/lib/auth/validation-rules";
import { issueEmailOtp } from "@/lib/services/platform/platform-email-configuration-service";
import { getDevUser, hasDevProfileName } from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";

const SUPPORT_EMAIL = "jassimtkd@gmail.com";

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

    if (mode === "support") {
      if (email !== SUPPORT_EMAIL) {
        return NextResponse.json({ error: "That email address is not registered for support login." }, { status: 403 });
      }

      await ensurePlatformDefaults();
      const admin = await prisma.platformAdmin.findUnique({ where: { email: SUPPORT_EMAIL } });
      if (!admin || !admin.is_active) {
        return NextResponse.json({ error: "Support login is not available for this email address." }, { status: 403 });
      }

      await issueEmailOtp(email, "SUPPORT");
      return NextResponse.json({ ok: true, message: "OTP sent." });
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

      await issueEmailOtp(email);
      return NextResponse.json({ ok: true, userExists: false, message: "OTP sent." });
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

    await issueEmailOtp(email);
    return NextResponse.json({ ok: true, userExists: true, message: "OTP sent." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send OTP." },
      { status: 500 },
    );
  }
}