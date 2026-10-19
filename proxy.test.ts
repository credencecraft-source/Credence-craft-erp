import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createPlatformSessionToken,
  createSessionToken,
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-token";
import { proxy } from "./proxy";

const originalAuthSecret = process.env.AUTH_SECRET;
const originalExpoWebAllowedOrigins = process.env.EXPO_WEB_ALLOWED_ORIGINS;

beforeEach(() => {
  process.env.AUTH_SECRET = "proxy-auth-test-secret";
  process.env.EXPO_WEB_ALLOWED_ORIGINS = "http://localhost:8082";
});

afterEach(() => {
  if (originalAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = originalAuthSecret;
  }
  if (originalExpoWebAllowedOrigins === undefined) {
    delete process.env.EXPO_WEB_ALLOWED_ORIGINS;
  } else {
    process.env.EXPO_WEB_ALLOWED_ORIGINS = originalExpoWebAllowedOrigins;
  }
});

function createRequest(path: string, cookieName: string, token: string) {
  const request = new NextRequest(`http://localhost${path}`);
  request.cookies.set(cookieName, token);
  return request;
}

describe("API authentication proxy", () => {
  it("allows credentialed CORS preflight from the configured Expo web origin", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/auth/mobile-otp/email", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8082",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:8082",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization, X-Platform-View",
    );
  });

  it("does not grant CORS access to an unconfigured origin", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/auth/mobile-otp/email", {
        method: "OPTIONS",
        headers: {
          Origin: "https://untrusted.example",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("includes CORS headers on API responses for the configured origin", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/auth/mobile-otp/email", {
        headers: { Origin: "http://localhost:8082" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:8082",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("allows the platform root login page without a platform session", () => {
    const response = proxy(new NextRequest("http://localhost/platform"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      "x-current-path",
    );
  });

  it("redirects unauthenticated platform pages to the platform login page", () => {
    const response = proxy(new NextRequest("http://localhost/platform/clients"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/platform");
  });

  it("allows platform API requests with a valid platform session", () => {
    const response = proxy(createRequest(
      "/api/platform/leads/lead-123/tickets",
      PLATFORM_SESSION_COOKIE_NAME,
      createPlatformSessionToken("admin-123"),
    ));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows platform API requests with a valid native bearer session", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/platform/mobile-session", {
        headers: {
          Authorization: `Bearer ${createPlatformSessionToken("admin-123")}`,
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects an invalid native bearer session on platform API requests", async () => {
    const response = proxy(
      new NextRequest("http://localhost/api/platform/mobile-session", {
        headers: { Authorization: "Bearer invalid-token" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required.",
    });
  });

  it("rejects a regular user session on platform API requests", async () => {
    const response = proxy(createRequest(
      "/api/platform/leads/lead-123/tickets",
      SESSION_COOKIE_NAME,
      createSessionToken("user-123"),
    ));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });

  it("allows the exact auth endpoints without a session", () => {
    const authResponse = proxy(new NextRequest("http://localhost/api/auth"));
    const platformAuthResponse = proxy(new NextRequest("http://localhost/api/platform/auth"));

    expect(authResponse.headers.get("x-middleware-next")).toBe("1");
    expect(platformAuthResponse.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not accept a platform session in place of an organization API session", async () => {
    const response = proxy(createRequest(
      "/api/orders/article-summary",
      PLATFORM_SESSION_COOKIE_NAME,
      createPlatformSessionToken("admin-123"),
    ));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required." });
  });
});
