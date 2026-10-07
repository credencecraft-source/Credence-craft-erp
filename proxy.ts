import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyPlatformSessionToken,
  verifySessionToken,
} from "@/lib/auth/session-token";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute =
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/platform/auth" ||
    pathname.startsWith("/api/platform/auth/");

  if (isPublicAuthRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-current-path", pathname);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const isPlatformApiRoute = pathname.startsWith("/api/platform/");
  const sessionToken = request.cookies.get(
    isPlatformApiRoute ? PLATFORM_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME,
  )?.value;
  const authenticatedUserId = isPlatformApiRoute
    ? verifyPlatformSessionToken(sessionToken)
    : verifySessionToken(sessionToken);
  if (!authenticatedUserId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/dashboard/:workspaceId/organizations/:organizationId/:path*",
    "/api/:path*",
  ],
};
