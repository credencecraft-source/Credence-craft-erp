import { NextResponse } from "next/server";

import {
  WORKSPACE_SUPPORT_SESSION_COOKIE_NAME,
  WORKSPACE_SUPPORT_SESSION_TTL_SECONDS,
} from "@/lib/auth/session-token";
import {
  startWorkspaceUserSupportSession,
  WorkspaceUserSupportAccessError,
} from "@/lib/services/platform/workspace-user-support-access-service";
import {
  getRequestOrigin,
  isSameOriginRequest,
} from "@/lib/security/same-origin-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }

  try {
    const { userId } = await params;
    const session = await startWorkspaceUserSupportSession(userId);
    const response = NextResponse.redirect(
      new URL(
        `/dashboard/${encodeURIComponent(session.workspaceId)}/home`,
        getRequestOrigin(request),
      ),
      { status: 303 },
    );
    response.cookies.set(WORKSPACE_SUPPORT_SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: WORKSPACE_SUPPORT_SESSION_TTL_SECONDS,
      expires: session.expiresAt,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof WorkspaceUserSupportAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "Unable to start workspace user support access.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return NextResponse.json(
      { error: "Unable to open this workspace user account." },
      { status: 500 },
    );
  }
}
