import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "cc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signValue(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  }

  const signingSecret = secret || "dev-auth-secret-change-me";
  return createHmac("sha256", signingSecret).update(value).digest("hex");
}

export function createSessionToken(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signValue(payload)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const [userId, expiresAtValue, signature] = token.split(".");

  if (!userId || !expiresAtValue || !signature) {
    return null;
  }

  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const payload = `${userId}.${expiresAtValue}`;
  const expected = signValue(payload);
  const input = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (input.length !== expectedBuffer.length) {
    return null;
  }

  try {
    if (timingSafeEqual(input, expectedBuffer)) {
      return userId;
    }
  } catch {
    return null;
  }

  return null;
}