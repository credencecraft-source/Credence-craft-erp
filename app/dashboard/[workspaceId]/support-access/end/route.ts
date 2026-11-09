import { NextResponse } from "next/server";

import {
  verifyWorkspaceSupportSessionToken,
  WORKSPACE_SUPPORT_SESSION_COOKIE_NAME,
} from "@/lib/auth/session-token";
import { endWorkspaceUserSupportSession } from "@/lib/services/platform/workspace-user-support-access-service";
import {
  getRequestOrigin,
  isSameOriginRequest,
} from "@/lib/security/same-origin-request";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403 },
    );
  }

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WORKSPACE_SUPPORT_SESSION_COOKIE_NAME}=`))
    ?.slice(WORKSPACE_SUPPORT_SESSION_COOKIE_NAME.length + 1);
  const supportSessionId = verifyWorkspaceSupportSessionToken(cookie);

  try {
    await endWorkspaceUserSupportSession(supportSessionId);
    const response = NextResponse.redirect(
      new URL("/platform/workspace-users", getRequestOrigin(request)),
      303,
    );
    response.cookies.set(WORKSPACE_SUPPORT_SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error(
      "Unable to end workspace user support access.",
      error instanceof Error ? error.message : "Unknown error.",
    );
    return NextResponse.json(
      { error: "Unable to end support access. Please retry." },
      { status: 500 },
    );
  }
}
