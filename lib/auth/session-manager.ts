import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

import { getDevUserById } from "@/lib/dev/dev-user-store-mock";
import { prisma } from "@/lib/database/prisma-client";

export type SessionUser = {
  id: string;
  workspace_id: string;
  profile_name: string;
  full_name: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

export const SESSION_COOKIE_NAME = "cc_session";
const USE_DEV_USER_STORE = process.env.USE_DEV_USER_STORE === "true";
const isDevBypass = USE_DEV_USER_STORE || !process.env.DATABASE_URL;

export function signValue(value: string) {
  const secret = process.env.AUTH_SECRET || "dev-auth-secret-change-me";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(userId: string) {
  return `${userId}.${signValue(userId)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [userId, signature] = token.split(".");

  if (!userId || !signature) {
    return null;
  }

  const expected = signValue(userId);
  const input = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (input.length !== expectedBuffer.length) {
    return null;
  }

  try {
    if (timingSafeEqual(input, expectedBuffer)) {
      return userId;
    }
  } catch {
    return null;
  }

  return null;
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  const token = createSessionToken(userId);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const userId = verifySessionToken(token);

  if (!userId) {
    return null;
  }

  if (isDevBypass) {
    const devUser = getDevUserById(userId);

    if (!devUser) {
      return null;
    }

    return {
      id: devUser.id,
      workspace_id: devUser.workspace_id,
      profile_name: devUser.profile_name,
      full_name: devUser.full_name,
      email: devUser.email,
      email_verified: devUser.email_verified,
      created_at: devUser.created_at,
      updated_at: devUser.updated_at,
      last_login_at: devUser.last_login_at,
    };
  }

  try {
    const user = await prisma.workspaceUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      workspace_id: user.workspace_id,
      profile_name: user.profile_name,
      full_name: user.full_name,
      email: user.email,
      email_verified: user.email_verified,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
    };
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function logoutSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

