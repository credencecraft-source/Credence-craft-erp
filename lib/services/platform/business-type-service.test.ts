import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    businessType: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  transaction: {
    eRPSoftware: { findMany: vi.fn() },
    eRPModule: { upsert: vi.fn() },
  },
  requirePlatformConfigurationAccess: vi.fn(),
  ensureStandardPlansForBusinessTypes: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformConfigurationAccess: mocks.requirePlatformConfigurationAccess,
}));
vi.mock("@/lib/services/platform/subscription-service", () => ({
  ensureStandardPlansForBusinessTypes: mocks.ensureStandardPlansForBusinessTypes,
}));

import { createBusinessTypeSidebarModule } from "./business-type-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.businessType.findUnique.mockResolvedValue({
    id: "business-type-1",
    name: "Order Management",
  });
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.transaction.eRPSoftware.findMany.mockResolvedValue([{ id: "software-1" }]);
});

describe("business type sidebar module initialization", () => {
  it("creates a newly available module hidden and preserves existing organization visibility", async () => {
    await createBusinessTypeSidebarModule("business-type-1");

    expect(mocks.transaction.eRPModule.upsert).toHaveBeenCalledWith({
      where: {
        software_id_module_key: {
          software_id: "software-1",
          module_key: "order-management",
        },
      },
      create: expect.objectContaining({
        software_id: "software-1",
        module_key: "order-management",
        module_name: "Order Management",
        status: "disabled",
      }),
      update: { module_name: "Order Management" },
    });
  });
});
