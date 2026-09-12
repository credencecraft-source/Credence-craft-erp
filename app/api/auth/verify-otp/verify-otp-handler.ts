import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-manager";
import {
  isValidEmail,
  isValidFullName,
  isValidProfileName,
  normalizeEmail,
  normalizeFullName,
  normalizeProfileName,
} from "@/lib/auth/validation-rules";
import { verifyEmailOtp } from "@/lib/services/platform/platform-email-configuration-service";
import { getDevUser, hasDevProfileName, setDevUser } from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";
import { setPlatformSessionCookie } from "@/lib/auth/platform-session-manager";

const SUPPORT_EMAIL = "jassimtkd@gmail.com";

const USE_DEV_USER_STORE = process.env.USE_DEV_USER_STORE === "true";
const isDevBypass =
  USE_DEV_USER_STORE ||
  !process.env.DATABASE_URL;

async function findUserByEmail(email: string) {
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

async function findUserByProfileName(profileName: string) {
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
    const otp = String(body.otp || "").trim();
    const mode = String(body.mode || "login").trim();

    if (mode !== "login" && mode !== "register" && mode !== "support") {
      return NextResponse.json(
        { error: "Invalid authentication mode." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email) || !otp) {
      return NextResponse.json(
        { error: "Please enter a valid email address and OTP." },
        { status: 400 }
      );
    }

    if (mode === "support") {
      if (email !== SUPPORT_EMAIL) {
        return NextResponse.json({ error: "That email address is not registered for support login." }, { status: 403 });
      }

      if (!(await verifyEmailOtp(email, otp, "SUPPORT"))) {
        return NextResponse.json({ error: "Invalid OTP." }, { status: 401 });
      }

      const admin = await prisma.platformAdmin.findUnique({ where: { email: SUPPORT_EMAIL } });
      if (!admin || !admin.is_active) {
        return NextResponse.json({ error: "Support login is not available for this email address." }, { status: 403 });
      }

      await prisma.platformAdmin.update({ where: { id: admin.id }, data: { last_login_at: new Date() } });
      await setPlatformSessionCookie(admin.id);
      return NextResponse.json({ ok: true, redirectTo: "/platform/organisations" });
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

    if (!(await verifyEmailOtp(email, otp))) {
      return NextResponse.json({ error: "Invalid OTP." }, { status: 401 });
    }

    let user = isDevBypass ? getDevUser(email) : await findUserByEmail(email);

    if (mode === "login") {
      if (!user) {
        return NextResponse.json(
          {
            error: "No account found. Please register first.",
            needsRegistration: true,
            redirectTo: "/",
          },
          { status: 404 }
        );
      }

      if (isDevBypass) {
        user = {
          ...user,
          last_login_at: new Date(),
          updated_at: new Date(),
        };
        setDevUser(user);
      } else {
        user = await prisma.workspaceUser.update({
          where: { id: user.id },
          data: { last_login_at: new Date() },
        });
      }
    } else if (mode === "register") {
      if (!isValidFullName(fullName) || !isValidProfileName(profileName)) {
        return NextResponse.json(
          { error: "Full name and profile name are required and must be valid." },
          { status: 400 }
        );
      }

      if (user) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }

      const existingProfile = await findUserByProfileName(profileName);
      if (existingProfile) {
        return NextResponse.json(
          { error: "Profile name already exists." },
          { status: 409 }
        );
      }

      user = isDevBypass
        ? setDevUser({
            id: `dev-user-${Date.now()}`,
            workspace_id: randomUUID(),
            profile_name: profileName,
            full_name: fullName,
            email,
            email_verified: true,
            created_at: new Date(),
            updated_at: new Date(),
            last_login_at: new Date(),
          })
        : await prisma.workspaceUser.create({
            data: {
              workspace_id: randomUUID(),
              profile_name: profileName,
              full_name: fullName,
              email,
              email_verified: true,
              last_login_at: new Date(),
            },
          });
    }

    if (!user) {
      return NextResponse.json(
        { error: "Authentication failed." },
        { status: 500 }
      );
    }

    const token = createSessionToken(user.id);
    const redirectTo = user.workspace_id
  ? `/dashboard/${user.workspace_id}/home`
  : "/dashboard";

    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        profileName: user.profile_name,
        fullName: user.full_name,
        email: user.email,
      },
      redirectTo,
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
} catch (error) {
  console.error("VERIFY OTP ERROR:");
  console.error(error);

  if (error instanceof Error) {
    console.error("MESSAGE:", error.message);
    console.error("STACK:", error.stack);
  }

  return NextResponse.json(
    {
      error: error instanceof Error
        ? error.message
        : "Authentication failed.",
    },
    { status: 500 }
  );
}
}