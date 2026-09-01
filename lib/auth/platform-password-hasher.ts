import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPlatformPassword(plainPassword: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(plainPassword, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPlatformPassword(plainPassword: string, storedHash: string) {
  const [salt, derivedKey] = storedHash.split(":");

  if (!salt || !derivedKey) {
    return false;
  }

  const candidate = scryptSync(plainPassword, salt, KEY_LENGTH);
  const expected = Buffer.from(derivedKey, "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}
