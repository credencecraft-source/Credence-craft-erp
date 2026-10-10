import { describe, expect, it } from "vitest";

import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import { groupHowItWorksModulesByTag, HOW_IT_WORKS_MODULES } from "./modulesData";

describe("How It Works module data", () => {
  it("includes operational modules and excludes administration-only modules", () => {
    const excludedModuleKeys = new Set(["admin", "settings"]);
    const excludedChildKeys: Record<string, Set<string>> = {
      approvals: new Set(["approval-settings"]),
    };

    for (const area of ERP_MODULES.filter((item) => !excludedModuleKeys.has(item.key))) {
      expect(HOW_IT_WORKS_MODULES.some((item) => item.key === area.key)).toBe(true);

      for (const child of area.children) {
        expect(HOW_IT_WORKS_MODULES.some((item) => item.key === `${area.key}-${child.key}`))
          .toBe(!excludedChildKeys[area.key]?.has(child.key));
      }
    }

    expect(HOW_IT_WORKS_MODULES.some((item) => item.key === "settings" || item.key === "admin")).toBe(false);
    expect(HOW_IT_WORKS_MODULES.some((item) => item.label === "Masters" || item.label === "Users" || item.label === "Pricing" || item.label === "Challan Numbers")).toBe(false);
  });

  it("shows business master definitions while omitting settings and admin masters", () => {
    const displayedMasterLabels = HOW_IT_WORKS_MODULES
      .filter((area) => !("parentKey" in area))
      .flatMap((area) => area.masterGroups.flatMap((group) => group.masters.map((master) => master.label)))
      .sort();
    const businessMasterLabels = MASTER_DEFINITIONS
      .filter((master) => master.moduleGroup !== "settings" && master.moduleGroup !== "admin")
      .map((master) => master.label)
      .sort();

    expect(displayedMasterLabels).toEqual(businessMasterLabels);
  });

  it("provides registered master records under their owning submodule without extra hierarchy", () => {
    const procurement = HOW_IT_WORKS_MODULES.find((area) => area.key === "order-management-procurement");
    const inventoryInward = HOW_IT_WORKS_MODULES.find((area) => area.key === "inventory-management-inward");

    expect(procurement?.masterGroups.flatMap((group) => group.masters.map((master) => master.label)))
      .toEqual(expect.arrayContaining(["Vendor", "GST", "HSN Code"]));
    expect(inventoryInward?.masterGroups.flatMap((group) => group.masters.map((master) => master.label)))
      .toEqual(expect.arrayContaining(["Stock UOM", "Raw Material"]));
  });

  it("keeps each module hook short and gives every workflow three procedural steps", () => {
    for (const area of HOW_IT_WORKS_MODULES) {
      expect(area.hook.trim().split(/\s+/).length).toBeLessThanOrEqual(10);
      for (const workflow of area.workflows) {
        expect(workflow.steps).toHaveLength(3);
      }
    }
  });

  it("groups tagged business types and omits business types without tags", () => {
    const groups = groupHowItWorksModulesByTag([
      { name: "Order Management", tags: ["Manufacturing", "Wholesale"] },
      { name: "Inventory Management", tags: ["Manufacturing"] },
      { name: "Factory Management", tags: ["Manufacturing"] },
      { name: "Finance Management", tags: ["Manufacturing"] },
      { name: "Design and Development", tags: ["Manufacturing"] },
      { name: "Online", tags: [] },
      { name: "Admin", tags: ["Office"] },
    ]);

    expect(groups.map((group) => group.tag)).toEqual(["Manufacturing", "Wholesale"]);
    expect(groups[0].businessTypes.map((businessType) => businessType.label)).toEqual([
      "Design and Development",
      "Order Management",
      "Inventory Management",
      "Factory Management",
      "Finance Management",
    ]);
    expect(groups[0].businessTypes[1].modules.map((module) => module.label)).toContain("Procurement");
    expect(groups.flatMap((group) => group.businessTypes).some((businessType) => businessType.label === "Online")).toBe(false);
  });

  it("shows the renamed Advance Booking business type in tagged module guides", () => {
    const groups = groupHowItWorksModulesByTag([
      { name: "Distribution", tags: ["Wholesale"] },
    ]);

    expect(groups[0]?.businessTypes[0]?.label).toBe("Advance Booking");
  });
});
