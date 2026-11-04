import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN } from "./organization-print-template-contract";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), organizationPrintTemplate: { findMany: vi.fn(), findFirst: vi.fn() } },
  transaction: {
    organizationPrintTemplate: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import {
  createOrganizationPrintTemplate,
  updateOrganizationPrintTemplate,
} from "./organization-print-template-service";

const template = {
  id: "template-1",
  document_type: "SALES_ORDER" as const,
  name: "STANDARD",
  is_active: true,
  is_default: true,
  design_config: DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  created_at: new Date("2026-11-04T00:00:00.000Z"),
  updated_at: new Date("2026-11-04T00:00:00.000Z"),
};
const input = {
  name: "Standard",
  documentType: "SALES_ORDER",
  designConfig: DEFAULT_ORGANIZATION_PRINT_TEMPLATE_DESIGN,
  isActive: true,
  isDefault: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1" });
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.transaction.organizationPrintTemplate.create.mockResolvedValue(template);
  mocks.transaction.organizationPrintTemplate.update.mockResolvedValue(template);
  mocks.transaction.organizationPrintTemplate.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.auditEvent.create.mockResolvedValue({});
});

describe("organization print-template service", () => {
  it("creates templates using the authorized internal organization and records an audit event", async () => {
    await expect(createOrganizationPrintTemplate(
      "user-1",
      "public-org-1",
      input,
    )).resolves.toMatchObject({
      id: "template-1",
      name: "STANDARD",
      isDefault: true,
    });

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "ORGANIZATION_SETTINGS",
    );
    expect(mocks.transaction.organizationPrintTemplate.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        document_type: "SALES_ORDER",
        is_default: true,
      },
      data: { is_default: false },
    });
    expect(mocks.transaction.organizationPrintTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        created_by: "user-1",
        name: "STANDARD",
      }),
    }));
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        user_id: "user-1",
        action: "DOCUMENT_PRINT_TEMPLATE_CREATED",
      }),
    }));
  });

  it("does not update a template that is outside the authorized organization", async () => {
    mocks.transaction.organizationPrintTemplate.findFirst.mockResolvedValue(null);

    await expect(updateOrganizationPrintTemplate(
      "user-1",
      "public-org-1",
      "foreign-template",
      input,
    )).resolves.toBeNull();

    expect(mocks.transaction.organizationPrintTemplate.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: "foreign-template" },
      select: { id: true, document_type: true, name: true, is_default: true },
    });
    expect(mocks.transaction.organizationPrintTemplate.update).not.toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("switches the default only among templates of the same authorized organization and document type", async () => {
    mocks.transaction.organizationPrintTemplate.findFirst.mockResolvedValue({
      id: "template-1",
      document_type: "SALES_ORDER",
      name: "OLD STANDARD",
      is_default: true,
    });

    await updateOrganizationPrintTemplate("user-1", "public-org-1", "template-1", {
      ...input,
      name: "New Standard",
      isDefault: true,
    });

    expect(mocks.transaction.organizationPrintTemplate.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        document_type: "SALES_ORDER",
        is_default: true,
        id: { not: "template-1" },
      },
      data: { is_default: false },
    });
    expect(mocks.transaction.organizationPrintTemplate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "template-1" },
      data: expect.objectContaining({ name: "NEW STANDARD", is_default: true }),
    }));
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "DOCUMENT_PRINT_TEMPLATE_UPDATED" }),
    }));
  });
});
