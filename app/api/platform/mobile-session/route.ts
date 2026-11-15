import { NextResponse } from "next/server";

import {
  getAvailablePlatformViews,
  getPlatformSessionAdmin,
  logoutPlatformSession,
  setPlatformViewMode,
  type PlatformViewMode,
} from "@/lib/auth/platform-session-manager";

function getSessionPayload(admin: NonNullable<Awaited<ReturnType<typeof getPlatformSessionAdmin>>>) {
  return {
    admin: {
      id: admin.id,
      fullName: admin.full_name,
      email: admin.email,
      actualRole: admin.actualRole,
      teamRole: admin.team_role,
    },
    availableViews: getAvailablePlatformViews(admin.actualRole, admin.team_role),
    activeView: admin.team_role ?? admin.role,
  };
}

export async function GET() {
  const admin = await getPlatformSessionAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Platform sign-in is required." }, { status: 401 });
  }
  return NextResponse.json(getSessionPayload(admin));
}

export async function POST(request: Request) {
  const admin = await getPlatformSessionAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Platform sign-in is required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const view = typeof payload === "object" && payload !== null &&
    "view" in payload && typeof payload.view === "string"
    ? payload.view
    : "";
  const allowedViews = getAvailablePlatformViews(admin.actualRole, admin.team_role);
  if (!allowedViews.includes(view as PlatformViewMode)) {
    return NextResponse.json({ error: "You do not have access to that platform workspace." }, { status: 403 });
  }

  if (admin.actualRole === "SUPER_ADMIN") {
    await setPlatformViewMode(view as PlatformViewMode);
  }
  return NextResponse.json({ ...getSessionPayload(admin), activeView: view });
}

export async function DELETE() {
  await logoutPlatformSession();
  return NextResponse.json({ ok: true });
}
