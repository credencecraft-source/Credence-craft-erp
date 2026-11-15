import { timingSafeEqual } from "node:crypto";
import { signValue } from "@/lib/auth/session-token";
import type { VariantSourceOrder } from "@/lib/services/orders/order-variant-input";

const PREPARATION_TTL_MS = 10 * 60 * 1000;

export type PreparedVariantOrder = {
  userId: string;
  organizationId: string;
  sourceOrderId: string;
  sourceUpdatedAt: number;
  expiresAt: number;
  source: VariantSourceOrder;
  allowedSizes: string[];
};

export function createPreparedVariantToken(prepared: Omit<PreparedVariantOrder, "expiresAt">) {
  const payload = Buffer.from(JSON.stringify({
    ...prepared,
    expiresAt: Date.now() + PREPARATION_TTL_MS,
  } satisfies PreparedVariantOrder)).toString("base64url");
  return `${payload}.${signValue(payload)}`;
}

export function readPreparedVariantToken(token: unknown): PreparedVariantOrder {
  if (typeof token !== "string" || token.length > 1_000_000) {
    throw new Error("Variant preparation expired. Click Variant again to reload the source order.");
  }

  const separator = token.lastIndexOf(".");
  if (separator < 1) throw new Error("Variant preparation is invalid. Click Variant again to reload the source order.");
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = Buffer.from(signValue(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Variant preparation is invalid. Click Variant again to reload the source order.");
  }

  let prepared: PreparedVariantOrder;
  try {
    prepared = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreparedVariantOrder;
  } catch {
    throw new Error("Variant preparation is invalid. Click Variant again to reload the source order.");
  }

  if (!prepared.userId || !prepared.organizationId || !prepared.sourceOrderId
    || !Number.isSafeInteger(prepared.sourceUpdatedAt)
    || !Number.isSafeInteger(prepared.expiresAt) || prepared.expiresAt <= Date.now()
    || !prepared.source || !Array.isArray(prepared.allowedSizes)) {
    throw new Error("Variant preparation expired. Click Variant again to reload the source order.");
  }

  return prepared;
}