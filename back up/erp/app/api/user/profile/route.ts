import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/bootstrap/prisma";
import { getCurrentUser } from "../../../lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ profileSettings: {} }, { status: 200 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { profileSettings: true },
  });

  return NextResponse.json({
    profileSettings: (dbUser?.profileSettings as Record<string, unknown>) ?? {},
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const profileSettings: Prisma.InputJsonValue = (body?.profileSettings ?? {}) as Prisma.InputJsonValue;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      profileSettings,
    },
    select: { id: true, profileSettings: true },
  });

  return NextResponse.json({
    profileSettings: updated.profileSettings ?? {},
  });
}
