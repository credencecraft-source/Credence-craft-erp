import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute =
    pathname.startsWith("/api/auth/") ||
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

  if (!request.cookies.has("cc_session")) {
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
