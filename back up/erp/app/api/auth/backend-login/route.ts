import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/bootstrap/prisma";
import { createSessionToken } from "../../../lib/auth";

const BACKEND_COOKIE_NAME = "erp_backend_session";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function verifyPassword(value: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  if (storedHash === value) {
    return true;
  }

  const expected = hashPassword(value);
  if (storedHash === expected) {
    return true;
  }

  const supplied = Buffer.from(expected, "hex");
  const actual = Buffer.from(storedHash, "hex");
  if (supplied.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(supplied, actual);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const adminEmail = (process.env.BACKEND_ADMIN_EMAIL ?? "admin@credencecraft.com").trim().toLowerCase();
    const adminPassword = process.env.BACKEND_ADMIN_PASSWORD ?? "admin123";

    const admin = await prisma.backendAdmin.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (admin && !admin.isActive) {
      return NextResponse.json({ error: "Your account is inactive. Please contact admin." }, { status: 403 });
    }

    const isValidBackendAdmin =
      (email === adminEmail && password === adminPassword) ||
      (admin ? verifyPassword(password, admin.passwordHash) : false);

    if (!isValidBackendAdmin) {
      return NextResponse.json({ error: "Invalid backend credentials." }, { status: 401 });
    }

    const authenticatedUser = admin ?? await prisma.backendAdmin.upsert({
      where: { email: adminEmail },
      update: { name: "Backend Admin" },
      create: {
        name: "Backend Admin",
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
      },
    });

    const sessionToken = createSessionToken(
      authenticatedUser.id,
      authenticatedUser.email,
      "backend-admin"
    );

    const response = NextResponse.json({
      message: "Backend login successful.",
      user: {
        id: authenticatedUser.id,
        name: authenticatedUser.name,
        email: authenticatedUser.email,
        profileName: "backend-admin",
      },
    });

    response.cookies.set({
      name: BACKEND_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sign in to backend." },
      { status: 500 }
    );
  }
}
