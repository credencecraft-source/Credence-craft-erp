import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured before handling encrypted secrets.");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}
