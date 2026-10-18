import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyPlatformSessionToken,
  verifySessionToken,
} from "@/lib/auth/session-token";

const apiCorsMethods = "GET, POST, OPTIONS";

function isAllowedApiOrigin(origin: string) {
  const configuredOrigins = process.env.EXPO_WEB_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredOrigins?.includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function addApiCorsHeaders(request: NextRequest, response: NextResponse) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return response;

  const origin = request.headers.get("origin");
  if (!origin || !isAllowedApiOrigin(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", apiCorsMethods);
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.append("Vary", "Origin");
  return response;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
    return addApiCorsHeaders(request, new NextResponse(null, { status: 204 }));
  }

  const isPublicAuthRoute =
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/platform/auth" ||
    pathname.startsWith("/api/platform/auth/");

  if (isPublicAuthRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-current-path", pathname);

    return addApiCorsHeaders(
      request,
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
    );
  }

  const isPlatformPageRoute =
    pathname === "/platform" || pathname.startsWith("/platform/");
  const isPlatformLoginPage = pathname === "/platform" || pathname === "/platform/";
  const isPlatformApiRoute = pathname.startsWith("/api/platform/");
  const isPlatformProtectedRoute = isPlatformPageRoute || isPlatformApiRoute;
  const sessionToken = request.cookies.get(
    isPlatformProtectedRoute ? PLATFORM_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME,
  )?.value;
  const authenticatedUserId = isPlatformProtectedRoute
    ? verifyPlatformSessionToken(sessionToken)
    : verifySessionToken(sessionToken);
  if (!authenticatedUserId) {
    if (isPlatformLoginPage) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-current-path", pathname);
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    if (pathname.startsWith("/api/")) {
      return addApiCorsHeaders(
        request,
        NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        ),
      );
    }

    return NextResponse.redirect(
      new URL(isPlatformPageRoute ? "/platform" : "/", request.url),
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", pathname);

  return addApiCorsHeaders(
    request,
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
  );
}

export const config = {
  matcher: [
    "/platform",
    "/platform/:path*",
    "/dashboard/:workspaceId/organizations/:organizationId/:path*",
    "/api/:path*",
  ],
};
