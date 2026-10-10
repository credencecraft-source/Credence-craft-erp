import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreparedVariantToken, readPreparedVariantToken } from "./order-variant-preparation";

const prepared = {
  userId: "user-id",
  organizationId: "organization-id",
  sourceOrderId: "source-order-id",
  sourceUpdatedAt: Date.parse("2026-09-28T10:00:00.000Z"),
  source: {} as never,
  allowedSizes: ["M", "L"],
};

describe("variant preparation token", () => {
  afterEach(() => vi.useRealTimers());

  it("round-trips a source snapshot for its user and organization", () => {
    const token = createPreparedVariantToken(prepared);
    expect(readPreparedVariantToken(token)).toMatchObject(prepared);
  });

  it("rejects tampered snapshots", () => {
    const token = createPreparedVariantToken(prepared);
    const [payload, signature] = token.split(".");
    const tampered = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;
    expect(() => readPreparedVariantToken(tampered)).toThrow("Variant preparation is invalid");
  });

  it("rejects expired snapshots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
    const token = createPreparedVariantToken(prepared);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(() => readPreparedVariantToken(token)).toThrow("Variant preparation expired");
  });
});