import { randomBytes, scryptSync } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPlatformPassword(plainPassword: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(plainPassword, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derivedKey}`;
}
