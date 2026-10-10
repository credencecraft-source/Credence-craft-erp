import { describe, expect, it } from "vitest";
import { restrictionMatchesFeature, restrictionMatchesHiddenRoute, restrictionMatchesRoute } from "./plan-restriction-matcher";

const feature = {
  key: "order-management/merchandising/orders",
  label: "Orders",
  master: "order-management",
  main: "merchandising",
  sub: ["orders"],
  route: ["order-management", "merchandising", "orders"],
};

const makeRule = (restriction_type: string) => ({
  master_module: "order-management",
  main_module: "merchandising",
  sub_module: "orders",
  restriction_type,
});

describe("plan restriction matching", () => {
  it.each(["block", "hide", "HIDE"])("matches %s rules for pricing feature availability", (restrictionType) => {
    expect(restrictionMatchesFeature(makeRule(restrictionType), feature)).toBe(true);
  });

  it.each([
    {
      label: "Order Summary",
      master: "order-management",
      main: "merchandising",
      sub: ["order-summary"],
      route: ["order-management", "merchandising", "order-summary"],
      restrictedSubmodule: "order-summary",
    },
    {
      label: "Style Wise PO",
      master: "order-management",
      main: "procurement",
      sub: ["style-wise-po"],
      route: ["order-management", "procurement", "create-po", "style-wise"],
      restrictedSubmodule: "style-wise-po",
    },
  ])("matches the $label feature restrictions configured in platform segments", ({ label, master, main, sub, route, restrictedSubmodule }) => {
    expect(restrictionMatchesFeature({
      master_module: master,
      main_module: main,
      sub_module: restrictedSubmodule,
      restriction_type: "block",
    }, { label, master, main, sub, route })).toBe(true);
  });

  it("does not treat hide rules as route blocks", () => {
    expect(restrictionMatchesRoute(makeRule("hide"), feature.route)).toBe(false);
  });

  it("matches hide rules for sidebar filtering", () => {
    expect(restrictionMatchesHiddenRoute(makeRule("hide"), feature.route)).toBe(true);
    expect(restrictionMatchesHiddenRoute(makeRule("block"), feature.route)).toBe(false);
  });
});