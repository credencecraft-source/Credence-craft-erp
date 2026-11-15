import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY,
  ORGANIZATION_PERMISSION_GROUPS,
  ORGANIZATION_PERMISSION_LABELS,
  ORGANIZATION_PERMISSIONS,
  getLegacyOrganizationModuleAccessPermissions,
  getLegacyOrganizationModuleSubmoduleAccessPermissions,
  getOrganizationModuleAccessPermission,
  getOrganizationModuleNavigationAccessPermissions,
  getOrganizationModuleNavigationItems,
  getOrganizationOrderManagementNavigationPermissions,
  getOrganizationOrderManagementPermission,
  getOrganizationRoutePermissionRequirements,
  getOrganizationSubmoduleAccessPermissionForPath,
  hasOrganizationModulePermission,
  type OrganizationPermissionKey,
} from "./organization-permission-registry";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";

describe("organization permission registry", () => {
  it("groups every registered permission exactly once and provides a display label", () => {
    const grouped = ORGANIZATION_PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((permission): OrganizationPermissionKey => permission),
    );

    expect([...grouped].sort()).toEqual([...ORGANIZATION_PERMISSIONS].sort());
    expect(new Set(grouped).size).toBe(ORGANIZATION_PERMISSIONS.length);
    for (const permission of ORGANIZATION_PERMISSIONS) {
      expect(ORGANIZATION_PERMISSION_LABELS[permission]).toBeTruthy();
    }
  });

  it("maps protected ERP modules and routes to their current granular read permissions", () => {
    expect(hasOrganizationModulePermission("order-management", ["ACCESS_MODULE_ORDER_MANAGEMENT"])).toBe(true);
    expect(hasOrganizationModulePermission("inventory-management", ["ACCESS_MODULE_INVENTORY_MANAGEMENT"])).toBe(true);
    expect(getOrganizationRoutePermissionRequirements(
      "order-management",
      "/dashboard/workspace/organizations/org/order-management/procurement",
    )).toEqual(["VIEW_PURCHASE_ORDERS"]);
    expect(getOrganizationRoutePermissionRequirements(
      "factory-management",
      "/dashboard/workspace/organizations/org/factory-management/pre-production/work-order",
    )).toEqual(["VIEW_WORK_ORDERS"]);
    expect(getOrganizationRoutePermissionRequirements(
      "pos",
      "/dashboard/workspace/organizations/org/pos/sales-return",
    )).toEqual([
      "VIEW_POS_SALES_RETURNS",
      "CREATE_POS_SALES_RETURNS",
      "SETTLE_POS_SALES_RETURN_REFUNDS",
    ]);
    expect(getOrganizationRoutePermissionRequirements(
      "pos",
      "/dashboard/workspace/organizations/org/pos/counter/new",
    )).toEqual(["VIEW_POS_COUNTERS"]);
    expect(getLegacyOrganizationModuleAccessPermissions(["CREATE_POS_COUNTERS"]))
      .toContain("ACCESS_MODULE_POS");
  });

  it("defines only workflow-supported CRUD controls for Order Management resources", () => {
    expect(getOrganizationOrderManagementNavigationPermissions(["merchandising", "order"]))
      .toEqual([
        getOrganizationOrderManagementPermission("merchandising/order", "view"),
        getOrganizationOrderManagementPermission("merchandising/order", "create"),
        getOrganizationOrderManagementPermission("merchandising/order", "edit"),
        getOrganizationOrderManagementPermission("merchandising/order", "delete"),
      ]);
    expect(getOrganizationOrderManagementNavigationPermissions(["merchandising", "bulk-order-creation"]))
      .toEqual([
        getOrganizationOrderManagementPermission("merchandising/bulk-order-creation", "view"),
        getOrganizationOrderManagementPermission("merchandising/bulk-order-creation", "create"),
      ]);
    expect(getOrganizationOrderManagementNavigationPermissions(["merchandising", "style-health"]))
      .toEqual([getOrganizationOrderManagementPermission("merchandising/style-health", "view")]);
    expect(getOrganizationOrderManagementPermission("merchandising/bom", "edit")).toBeUndefined();
  });

  it("uses resource actions as the route gate for registered Order Management workflows", () => {
    expect(getOrganizationRoutePermissionRequirements(
      "order-management",
      "/dashboard/workspace/organizations/org/order-management/merchandising/order",
    )).toContain(getOrganizationOrderManagementPermission("merchandising/order", "view"));
    expect(getOrganizationRoutePermissionRequirements(
      "order-management",
      "/dashboard/workspace/organizations/org/order-management/procurement/purchase-order",
    )).toContain(getOrganizationOrderManagementPermission("procurement/purchase-order", "delete"));
  });

  it("maps every platform ERP module to one independently switchable role permission", () => {
    expect(Object.keys(ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY).sort())
      .toEqual(ERP_MODULES.map(({ key }) => key).sort());

    for (const erpModule of ERP_MODULES) {
      const permission = getOrganizationModuleAccessPermission(erpModule.key);
      expect(permission).toBeTruthy();
      expect(ORGANIZATION_PERMISSIONS).toContain(permission);
      expect(ORGANIZATION_PERMISSION_LABELS[permission!]).toBeTruthy();
    }

    expect(new Set(Object.values(ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY)).size)
      .toBe(ERP_MODULES.length);
  });

  it("maps every platform sidebar item to an independently switchable route permission", () => {
    for (const erpModule of ERP_MODULES) {
      for (const permission of getOrganizationModuleNavigationAccessPermissions(erpModule.key)) {
        expect(ORGANIZATION_PERMISSIONS).toContain(permission);
        expect(ORGANIZATION_PERMISSION_LABELS[permission]).toBeTruthy();
      }
    }

    expect(getOrganizationSubmoduleAccessPermissionForPath(
      "/dashboard/workspace/organizations/org/pos/offers",
      "/dashboard/workspace/organizations/org",
    )).toBe("ACCESS_SUBMODULE:pos:offers");
    expect(getLegacyOrganizationModuleSubmoduleAccessPermissions(
      getLegacyOrganizationModuleAccessPermissions(["VIEW_POS_SALES"]),
    )).toContain("ACCESS_SUBMODULE:pos:offers");
    expect(getOrganizationModuleNavigationItems("unknown-module")).toEqual([]);
  });

  it("derives legacy module access without coupling independent module switches", () => {
    const legacyAccess = getLegacyOrganizationModuleAccessPermissions(["VIEW_ORDERS"]);

    expect(legacyAccess).toContain("ACCESS_MODULE_ORDER_MANAGEMENT");
    expect(legacyAccess).toContain("ACCESS_MODULE_DISTRIBUTION");
    expect(legacyAccess).toContain("ACCESS_MODULE_ONLINE");
    expect(hasOrganizationModulePermission("order-management", ["VIEW_ORDERS"])).toBe(false);
    expect(hasOrganizationModulePermission("order-management", ["ACCESS_MODULE_ORDER_MANAGEMENT"])).toBe(true);
  });
});
