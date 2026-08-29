import { NextRequest, NextResponse } from "next/server";
import { parseSessionToken } from "../../../lib/auth";
import { prisma } from "../../../lib/bootstrap/prisma";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("erp_backend_session")?.value;
  const session = parseSessionToken(token);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await prisma.backendAdmin.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ user: null }, { status: 403 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      profileName: user.name || "backend-admin",
      isPlatformAdmin: true,
    },
  });
}
