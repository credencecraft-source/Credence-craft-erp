import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionToken } from "./app/lib/auth";

const PROTECTED_PREFIXES = [
  "/workspace",
  "/merchandising",
  "/purchase",
  "/masters",
  "/settings",
  "/vendors",
  "/onboarding",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = parseSessionToken(token);

  if (!session) {
    const url = new URL("/", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/workspace/:path*",
    "/merchandising/:path*",
    "/purchase/:path*",
    "/masters/:path*",
    "/settings/:path*",
    "/vendors/:path*",
    "/onboarding/:path*",
  ],
};
