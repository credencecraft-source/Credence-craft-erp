import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    businessType: { findMany: vi.fn() },
    eRPSoftware: { findFirst: vi.fn() },
    eRPModule: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  transaction: {
    organization: { findUnique: vi.fn() },
    eRPSoftware: { findFirst: vi.fn(), create: vi.fn() },
    eRPModule: { findMany: vi.fn(), upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  requirePlatformSessionAdmin: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));

import {
  getOrganizationModuleVisibility,
  setOrganizationModuleVisibility,
} from "./organization-module-visibility-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-1" });
  mocks.prisma.organization.findUnique.mockResolvedValue({ id: "internal-org-1" });
  mocks.prisma.businessType.findMany.mockResolvedValue([{ name: "Order Management" }]);
  mocks.prisma.eRPSoftware.findFirst.mockResolvedValue({ id: "software-1" });
  mocks.prisma.eRPModule.findMany.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.transaction.organization.findUnique.mockResolvedValue({ id: "internal-org-1" });
  mocks.transaction.eRPSoftware.findFirst.mockResolvedValue({ id: "software-1" });
  mocks.transaction.eRPModule.findMany.mockResolvedValue([
    { id: "order-module", module_key: "order-management", status: "enabled" },
    { id: "asset-module", module_key: "asset-management", status: "enabled" },
  ]);
  mocks.transaction.eRPModule.upsert.mockResolvedValue({ id: "order-module" });
});

describe("organization module visibility", () => {
  it("uses saved module statuses and defaults unconfigured modules to disabled", async () => {
    mocks.prisma.eRPModule.findMany.mockResolvedValue([
      { module_key: "order-management", status: "disabled" },
    ]);

    await expect(getOrganizationModuleVisibility("internal-org-1")).resolves.toEqual([
      { key: "order-management", label: "Order Management", isEnabled: false },
      { key: "asset-management", label: "Asset Management", isEnabled: false },
    ]);
  });

  it("persists a visibility change and records an organization audit event", async () => {
    await expect(
      setOrganizationModuleVisibility("internal-org-1", "order-management", false),
    ).resolves.toEqual({ changed: true, isEnabled: false });

    expect(mocks.transaction.eRPModule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        software_id_module_key: {
          software_id: "software-1",
          module_key: "order-management",
        },
      },
      update: { module_name: "Order Management", status: "disabled" },
    }));
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        action: "MODULE_VISIBILITY_UPDATED",
        entity_type: "ERPModule",
        details: expect.objectContaining({
          platformAdminId: "platform-admin-1",
          moduleKey: "order-management",
          previousStatus: "enabled",
          newStatus: "disabled",
        }),
      }),
    });
  });

  it("allows disabling the last platform-enabled module", async () => {
    mocks.transaction.eRPModule.findMany.mockResolvedValue([
      { id: "order-module", module_key: "order-management", status: "enabled" },
      { id: "asset-module", module_key: "asset-management", status: "disabled" },
    ]);

    await expect(
      setOrganizationModuleVisibility("internal-org-1", "order-management", false),
    ).resolves.toEqual({ changed: true, isEnabled: false });
    expect(mocks.transaction.eRPModule.upsert).toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalled();
  });
});
