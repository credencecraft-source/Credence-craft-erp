import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    eRPModule: { findFirst: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import {
  getFirstAvailableOrganizationModulePath,
  isOrganizationModuleAvailable,
  isOrganizationModuleVisible,
  OrganizationModuleVisibilityError,
  setOrganizationModuleVisibility,
} from "./organization-module-visibility-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrganizationPermission.mockResolvedValue({
    organization_id: "internal-org-1",
  });
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.transaction.eRPModule.findFirst.mockResolvedValue({
    id: "module-record-1",
    module_key: "order-management",
    module_name: "Order Management",
    status: "enabled",
    settings: { legacySetting: "kept", organization_visible: false },
  });
  mocks.transaction.eRPModule.update.mockResolvedValue({});
});

describe("organization module visibility", () => {
  it("defaults unset organization visibility to visible while respecting explicit hidden settings", () => {
    expect(isOrganizationModuleVisible(null)).toBe(true);
    expect(isOrganizationModuleVisible({ legacySetting: true })).toBe(true);
    expect(isOrganizationModuleVisible({ organization_visible: true })).toBe(true);
    expect(isOrganizationModuleVisible({ organization_visible: false })).toBe(false);
  });

  it("allows platform-enabled modules by default unless the organization explicitly hides them", () => {
    expect(isOrganizationModuleAvailable(" enabled ", true)).toBe(true);
    expect(isOrganizationModuleAvailable("disabled", true)).toBe(false);
    expect(isOrganizationModuleAvailable("enabled", false)).toBe(false);
    expect(isOrganizationModuleAvailable("enabled", isOrganizationModuleVisible(null))).toBe(true);
    expect(isOrganizationModuleAvailable(
      "enabled",
      isOrganizationModuleVisible({ organization_visible: false }),
    )).toBe(false);
  });

  it("chooses a visible module's first navigation route in registry order", () => {
    expect(getFirstAvailableOrganizationModulePath([
      { moduleKey: "online", status: "disabled", isVisible: true },
      { moduleKey: "pos", status: " ENABLED ", isVisible: true },
      { moduleKey: "order-management", status: "enabled", isVisible: true },
    ])).toBe("/pos/quick-invoice");
  });

  it("skips hidden modules and resolves nested navigation paths", () => {
    expect(getFirstAvailableOrganizationModulePath([
      { moduleKey: "online", status: "enabled", isVisible: false },
      { moduleKey: "pos", status: "enabled", isVisible: false },
      { moduleKey: "order-management", status: "enabled", isVisible: true },
    ])).toBe("/order-management/merchandising/order");
  });

  it("returns no fallback when the organization has no available modules", () => {
    expect(getFirstAvailableOrganizationModulePath([
      { moduleKey: "pos", status: "disabled", isVisible: true },
    ])).toBeNull();
  });

  it("persists only the organization setting and audits it against the authorized tenant", async () => {
    await expect(setOrganizationModuleVisibility(
      "workspace-user-1",
      "public-org-1",
      "order-management",
      true,
    )).resolves.toEqual({ changed: true, isVisible: true });

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "workspace-user-1",
      "public-org-1",
      "ORGANIZATION_SETTINGS",
    );
    expect(mocks.transaction.eRPModule.findFirst).toHaveBeenCalledWith({
      where: {
        module_key: "order-management",
        software: { is: { organization_id: "internal-org-1" } },
      },
      select: {
        id: true,
        module_key: true,
        module_name: true,
        status: true,
        settings: true,
      },
    });
    expect(mocks.transaction.eRPModule.update).toHaveBeenCalledWith({
      where: { id: "module-record-1" },
      data: {
        settings: { legacySetting: "kept", organization_visible: true },
      },
    });
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        user_id: "workspace-user-1",
        action: "ORGANIZATION_MODULE_VISIBILITY_UPDATED",
        details: expect.objectContaining({
          moduleKey: "order-management",
          previousVisibility: false,
          newVisibility: true,
        }),
      }),
    });
  });

  it("rejects organization visibility for modules disabled by the platform", async () => {
    mocks.transaction.eRPModule.findFirst.mockResolvedValue({
      id: "module-record-1",
      module_key: "order-management",
      module_name: "Order Management",
      status: "disabled",
      settings: null,
    });

    await expect(setOrganizationModuleVisibility(
      "workspace-user-1",
      "public-org-1",
      "order-management",
      true,
    )).rejects.toBeInstanceOf(OrganizationModuleVisibilityError);
    expect(mocks.transaction.eRPModule.update).not.toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects unknown modules before performing a database write", async () => {
    await expect(setOrganizationModuleVisibility(
      "workspace-user-1",
      "public-org-1",
      "not-a-module",
      true,
    )).rejects.toBeInstanceOf(OrganizationModuleVisibilityError);
    expect(mocks.requireOrganizationPermission).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
