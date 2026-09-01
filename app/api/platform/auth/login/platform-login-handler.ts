import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { verifyPlatformPassword } from "@/lib/auth/platform-password-hasher";
import { setPlatformSessionCookie } from "@/lib/auth/platform-session-manager";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";

export async function POST(request: Request) {
  try {
    await ensurePlatformDefaults();

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Please enter an email and password." }, { status: 400 });
    }

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });

    if (!admin || !admin.is_active || !verifyPlatformPassword(password, admin.password_hash)) {
      return NextResponse.json({ error: "Invalid support team credentials." }, { status: 401 });
    }

    await prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { last_login_at: new Date() },
    });

    await setPlatformSessionCookie(admin.id);

    return NextResponse.json({ redirectTo: "/platform/clients" });
  } catch {
    return NextResponse.json({ error: "Unable to sign in right now. Please try again." }, { status: 500 });
  }
}
