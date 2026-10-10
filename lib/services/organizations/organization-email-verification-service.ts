import { timingSafeEqual } from "node:crypto";

import { signValue } from "@/lib/auth/session-token";
import { normalizeEmail } from "@/lib/auth/validation-rules";

export const ORGANIZATION_EMAIL_VERIFICATION_COOKIE = "cc_organization_email_verified";

const VERIFICATION_TTL_MS = 10 * 60 * 1000;

type OrganizationEmailVerificationPayload = {
  userId: string;
  email: string;
  expiresAt: number;
};

export function createOrganizationEmailVerificationToken(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    email: normalizeEmail(email),
    expiresAt: Date.now() + VERIFICATION_TTL_MS,
  } satisfies OrganizationEmailVerificationPayload)).toString("base64url");

  return `${payload}.${signValue(payload)}`;
}

export function isOrganizationEmailVerificationTokenValid(
  token: unknown,
  userId: string,
  email: string,
) {
  if (typeof token !== "string" || token.length > 2_048) return false;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = Buffer.from(signValue(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  let verified: OrganizationEmailVerificationPayload;
  try {
    verified = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OrganizationEmailVerificationPayload;
  } catch {
    return false;
  }

  return verified.userId === userId
    && verified.email === normalizeEmail(email)
    && Number.isSafeInteger(verified.expiresAt)
    && verified.expiresAt > Date.now();
}
