import { describe, expect, it } from "vitest";
import { findPlanForVersionSegment } from "./plan-service";

describe("version segment plan lookup", () => {
  it("matches a shared tier name only within its business type", () => {
    const plans = [
      { id: "pos-free", business_type_id: "pos", plan_name: "POS - Free", tier_key: "free" },
      { id: "orders-free", business_type_id: "orders", plan_name: "Order Management - Free", tier_key: "free" },
    ];

    expect(findPlanForVersionSegment(plans, "orders", "Free")?.id).toBe("orders-free");
  });
});