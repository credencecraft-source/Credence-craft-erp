import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requirePlatformSessionAdmin, requirePlatformSessionSuperAdmin } = vi.hoisted(() => {
  const transactionMock = {
    $executeRaw: vi.fn(),
    platformAuditEvent: { create: vi.fn() },
    workspaceUser: { update: vi.fn() },
    organization: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    factoryDailyProductionReportLine: { deleteMany: vi.fn() },
    factoryGrn: { deleteMany: vi.fn() },
    factoryBundleTransfer: { deleteMany: vi.fn() },
    workOrderProcessControllerProcess: { deleteMany: vi.fn() },
    workOrderProcessController: { deleteMany: vi.fn() },
    orderProcessControllerProcess: { deleteMany: vi.fn() },
    orderProcessController: { deleteMany: vi.fn() },
    merchandisingOrderProcessStep: { deleteMany: vi.fn() },
    eRPSoftware: { create: vi.fn() },
    eRPModule: { createMany: vi.fn() },
    organizationRoleDefinition: { create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    organizationRolePermission: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    organizationMembership: { create: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
    auditEvent: { create: vi.fn() },
    masterGstType: { createMany: vi.fn() },
    masterGst: { findMany: vi.fn(), createMany: vi.fn() },
    masterRawMaterialType: { createMany: vi.fn() },
    masterProduct: { createMany: vi.fn() },
    masterEntity: { createMany: vi.fn() },
    masterState: { createMany: vi.fn() },
    masterProcess: { findFirst: vi.fn(), create: vi.fn() },
    masterOperationTemplate: { findFirst: vi.fn(), create: vi.fn() },
    masterOperationTemplateStep: { findFirst: vi.fn(), create: vi.fn() },
    masterProcessTemplate: { findFirst: vi.fn(), create: vi.fn() },
    masterProcessTemplateStep: { createMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    organizationMembership: { findFirst: vi.fn(), groupBy: vi.fn() },
    organizationRoleDefinition: { findUnique: vi.fn() },
    organizationRolePermission: { findMany: vi.fn() },
  };
  const requirePlatformSessionAdmin = vi.fn();
  const requirePlatformSessionSuperAdmin = vi.fn();
  return { prismaMock, transactionMock, requirePlatformSessionAdmin, requirePlatformSessionSuperAdmin };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin,
  requirePlatformSessionSuperAdmin,
}));

import {
  normalizeDisplayText,
  normalizeFullName,
  normalizeProfileName,
  normalizeStatusLabel,
  normalizeSystemStatusKey,
} from "@/lib/auth/validation-rules";
import {
  archiveOrganization,
  countOrganizationsForUser,
  createOrganizationRole,
  updateOrganizationMember,
  getOrganizationForUserWithPermission,
  getOrganizationEffectivePermissions,
  hasOrganizationsForUser,
  createOrganization,
  deleteOrganizationFromPlatform,
  forceDeleteOrganizationFromPlatform,
  getOrganizationInternalIdForUser,
  getOrganizationDeletionEligibility,
  listWorkspaceOrganizationPage,
  updateOrganizationRolePermissions,
  updateOrganizationRole,
  restoreOrganization,
  requireOrganizationPermission,
  requireOrganizationOrderManagementPermission,
  updateOrganizationApprovalStatus,
  updateOrganizationApprovalStatusWithTransition,
} from "./organization-service";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import {
  getOrganizationModuleAccessPermission,
  getOrganizationModuleNavigationItems,
  getOrganizationOrderManagementPermission,
} from "@/lib/organizations/organization-permission-registry";

const organization = {
  id: "org-internal-id",
  organization_number: "0000000123",
  organization_id: "org-public-id",
  organization_name: "Northwind Apparel",
  approval_status: "APPROVED",
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
  requirePlatformSessionSuperAdmin.mockResolvedValue({ id: "platform-admin-id" });
  prismaMock.organization.findUnique.mockResolvedValue({ approval_status: "PENDING_APPROVAL" });
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.$executeRaw.mockResolvedValue(1);
  transactionMock.organization.create.mockResolvedValue(organization);
  transactionMock.eRPSoftware.create.mockResolvedValue({ id: "erp-software-id" });
  transactionMock.workspaceUser.update.mockResolvedValue({ id: "workspace-user-id" });
  transactionMock.masterGst.findMany.mockResolvedValue([]);
  transactionMock.masterProcess.create.mockImplementation(({ data }: { data: { process_name: string } }) => Promise.resolve({ id: `process-${data.process_name}` }));
  transactionMock.masterOperationTemplate.create.mockImplementation(({ data }: { data: { operation_template_name: string } }) => Promise.resolve({ id: `operation-template-${data.operation_template_name}` }));
  transactionMock.masterProcessTemplate.create.mockResolvedValue({ id: "process-template-id" });
});

describe("getOrganizationInternalIdForUser", () => {
  it("uses active organization membership and selects only the internal ID", async () => {
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-internal-id" });

    await expect(getOrganizationInternalIdForUser("user-1", "org-public-id"))
      .resolves.toEqual({ id: "org-internal-id" });

    expect(prismaMock.organization.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "org-public-id",
        is_active: true,
        memberships: { some: { workspace_user_id: "user-1", is_active: true } },
      },
      select: { id: true },
    });
  });
});

describe("shared display-text normalization", () => {
  it("trims and standardizes name-like input to title case while preserving emails and codes", () => {
    expect(normalizeDisplayText("  jOHN   DOE  ")).toBe("John Doe");
    expect(normalizeProfileName("  FULL  CAP  ")).toBe("Full Cap");
    expect(normalizeFullName("  mARIA  dELA  cRUZ  ")).toBe("Maria Dela Cruz");
    expect(normalizeDisplayText("  abC@EXAMPLE.COM  ")).toBe("abc@example.com");
    expect(normalizeDisplayText("  GSTIN-123  ")).toBe("Gstin-123");
  });

  it("normalizes system and custom status labels consistently at the shared boundary", () => {
    expect(normalizeStatusLabel("  draft  ")).toBe("Draft");
    expect(normalizeStatusLabel("WAITING_FOR_APPROVAL")).toBe("Waiting For Approval");
    expect(normalizeStatusLabel("pending review")).toBe("Pending Review");
    expect(normalizeSystemStatusKey("  draft  ")).toBe("DRAFT");
    expect(normalizeSystemStatusKey("waiting for approval")).toBe("WAITING_FOR_APPROVAL");
  });
});

describe("organization creation defaults", () => {
  it("creates default master data and the process template transactionally", async () => {
    await createOrganization({
      workspaceUserId: "workspace-user-id",
      organizationName: "Northwind Apparel",
      organizationEmail: " SALES@NORTHWIND.COM ",
      gstNumber: "22AAAAA0000A1Z5",
      mobileNo: "9876543210",
    });

    describe("organization approval transitions", () => {
      it("reports a new approval transition so sample setup can be queued once", async () => {
        transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
        transactionMock.organization.findUnique
          .mockResolvedValueOnce({
            approval_status: "APPROVED",
            trial_started_at: null,
            trial_enabled: true,
            trial_extension_hours: 0,
          })
          .mockResolvedValueOnce(organization);

        await expect(updateOrganizationApprovalStatusWithTransition("org-internal-id", "APPROVED"))
          .resolves.toEqual({ organization, approvedNow: true });
      });

      it("does not report a new approval transition for an already-approved organization", async () => {
        prismaMock.organization.findUnique.mockResolvedValue({ approval_status: "APPROVED" });
        transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
        transactionMock.organization.findUnique
          .mockResolvedValueOnce({
            approval_status: "APPROVED",
            trial_started_at: null,
            trial_enabled: true,
            trial_extension_hours: 0,
          })
          .mockResolvedValueOnce(organization);

        await expect(updateOrganizationApprovalStatusWithTransition("org-internal-id", "APPROVED"))
          .resolves.toEqual({ organization, approvedNow: false });
      });
    });

    expect(transactionMock.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_name: "Northwind Apparel",
        organization_email: "sales@northwind.com",
        gst_number: "22AAAAA0000A1Z5",
        mobile_number: "9876543210",
      }),
    });
    expect(transactionMock.eRPModule.createMany).toHaveBeenCalledWith({
      data: ERP_MODULES.map(({ key, label }) => ({
        software_id: "erp-software-id",
        module_key: key,
        module_name: label,
        status: "disabled",
      })),
    });
    expect(transactionMock.masterRawMaterialType.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, raw_material_type: "Item", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterProduct.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, product_master_name: "Finished Goods", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterEntity.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, entity_name: "Northwind Apparel", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterGst.createMany).toHaveBeenCalledWith({
      data: [5, 12, 18, 28].map((rate, index) => ({
        organization_id: organization.id,
        name: `${rate}%`,
        gst: rate,
        cgst_rate: rate / 2,
        sgst_rate: rate / 2,
        igst_rate: rate,
        is_active: true,
        sort_order: index,
      })),
      skipDuplicates: true,
    });
    expect(transactionMock.masterProcessTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organization.id,
        process_name: "No Embroidery Only Wash",
        legacy_metadata: {
          first_process_id: "process-Cutting",
          last_process_id: "process-Iron",
        },
        is_active: true,
        sort_order: 0,
      }),
      select: { id: true },
    });
    const templateData = transactionMock.masterProcessTemplate.create.mock.calls[0][0].data;
    expect(templateData).not.toHaveProperty("first_process_id");
    expect(templateData).not.toHaveProperty("last_process_id");
    expect(transactionMock.masterProcessTemplateStep.createMany).toHaveBeenCalledWith({
      data: [
        ["Cutting", "Cutting Basic"],
        ["Production", "Parts Basic"],
        ["Washing", "Washing Basic"],
        ["KajaButtoning", "KajaButtoning Basic"],
        ["Iron", "Iron"],
        ["Packing", "Packing"],
      ].map(([processName, operationTemplateName], index) => ({
        organization_id: organization.id,
        process_template_id: "process-template-id",
        process_id: `process-${processName}`,
        operation_template_id: `operation-template-${operationTemplateName}`,
        process_name: processName,
        sl_no: index + 1,
        is_active: true,
        sort_order: index,
        legacy_metadata: {
          is_returnable_process: false,
          block_by_process_id: null,
        },
      })),
    });
    expect(transactionMock.masterProcessTemplateStep.createMany.mock.calls[0][0].data.every(
      (step: Record<string, unknown>) => !("is_returnable_process" in step) && !("block_by_process_id" in step),
    )).toBe(true);
    expect(transactionMock.masterOperationTemplateStep.create).toHaveBeenCalledTimes(6);
    expect(transactionMock.masterOperationTemplateStep.create).toHaveBeenCalledWith({
      data: {
        organization_id: organization.id,
        operation_template_id: "operation-template-Cutting Basic",
        operation: "Cutting Basic",
        sl_no: 1,
        price: 0,
        is_active: true,
        sort_order: 0,
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10000, timeout: 30000 });
  });

  it("updates the verified workspace email in the organization creation transaction", async () => {
    await createOrganization({
      workspaceUserId: "workspace-user-id",
      verifiedWorkspaceEmail: "owner@example.com",
      workspaceUserFullName: "Owner Name",
      organizationName: "Northwind Apparel",
      organizationEmail: "owner@example.com",
      gstNumber: "22AAAAA0000A1Z5",
    });

    expect(transactionMock.workspaceUser.update).toHaveBeenCalledWith({
      where: { id: "workspace-user-id" },
      data: {
        email: "owner@example.com",
        email_verified: true,
        full_name: "Owner Name",
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 10000, timeout: 30000 },
    );
  });

  it("rejects an invalid organization email before writing", async () => {
    await expect(createOrganization({
      workspaceUserId: "workspace-user-id",
      organizationName: "Northwind Apparel",
      organizationEmail: "not-an-email",
      gstNumber: "22AAAAA0000A1Z5",
    })).rejects.toThrow("Organization email must be a valid email address of 320 characters or fewer.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("organization directory identifiers", () => {
  it("returns fixed-width numeric IDs that can be serialized to the directory client", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{
      id: "org-internal-id",
      organization_number: "0000000123",
      organization_id: "org-public-id",
      organization_name: "Northwind Apparel",
      gst_number: "22AAAAA0000A1Z5",
      approval_status: "APPROVED",
      is_active: true,
      memberships: [{ role: "OWNER" }],
      roleDefinitions: [{ role_key: "OWNER", label: "Owner" }],
      rolePermissions: [],
    }]);
    prismaMock.organization.groupBy.mockResolvedValue([{
      is_active: true,
      approval_status: "APPROVED",
      _count: { _all: 1 },
    }]);

    const page = await listWorkspaceOrganizationPage("workspace-user-id");

    expect(page.organizations[0].organization_number).toBe("0000000123");
    expect(() => JSON.stringify(page)).not.toThrow();
  });

  describe("organization permission evaluation", () => {
    it("returns the API role shape after creating a custom role", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "OWNER",
      });
      transactionMock.organizationRoleDefinition.create.mockResolvedValue({
        id: "custom-role-id",
        role_key: "PRODUCTION_MANAGER",
        label: "Production Manager",
        is_system: false,
      });

      await expect(createOrganizationRole(
        "org-public-id",
        "owner-user-id",
        "Production Manager",
        [],
      )).resolves.toEqual({
        role: "PRODUCTION_MANAGER",
        label: "Production Manager",
        isSystem: false,
        permissions: [],
      });
      expect(transactionMock.organizationRolePermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ permission: "DENY:MANAGE_ROLES" }),
        ]),
      });
    });

    it("denies a default permission when the role has an explicit denial marker", async () => {
      prismaMock.organization.findFirst.mockResolvedValue({
        id: "org-internal-id",
        memberships: [{ role: "ADMIN" }],
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "MANAGE_USERS" },
        { permission: "DENY:VIEW_REPORTS" },
      ]);

      await expect(getOrganizationForUserWithPermission(
        "workspace-user-id",
        "org-public-id",
        "VIEW_REPORTS",
      )).rejects.toThrow("Access denied: This role does not have the required permission.");
    });

    it("uses the same deny-by-default evaluation in organization service authorization", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "MANAGE_USERS" },
        { permission: "DENY:VIEW_REPORTS" },
      ]);

      await expect(requireOrganizationPermission(
        "admin-user-id",
        "org-public-id",
        "VIEW_REPORTS",
      )).rejects.toThrow("Access denied: This role does not have the required permission.");
    });

    it("keeps legacy order access until a resource-specific action is explicitly denied", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([]);

      await expect(requireOrganizationOrderManagementPermission(
        "admin-user-id",
        "org-public-id",
        "merchandising/order",
        "create",
      )).resolves.toMatchObject({ organization_id: "org-internal-id", role: "ADMIN" });

      const createPermission = getOrganizationOrderManagementPermission("merchandising/order", "create");
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: `DENY:${createPermission}` },
      ]);
      await expect(requireOrganizationOrderManagementPermission(
        "admin-user-id",
        "org-public-id",
        "merchandising/order",
        "create",
      )).rejects.toThrow("Access denied: This role does not have the required Order Management permission.");
    });

    it("expands legacy order permissions into resource actions without overriding explicit denials", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      const deletePermission = getOrganizationOrderManagementPermission("merchandising/order", "delete");
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: `DENY:${deletePermission}` },
      ]);

      const permissions = await getOrganizationEffectivePermissions("admin-user-id", "org-public-id");

      expect(permissions).toContain(getOrganizationOrderManagementPermission("merchandising/order", "create"));
      expect(permissions).not.toContain(deletePermission);
    });

    it("keeps role-management access for legacy administrator roles unless explicitly denied", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([]);

      await expect(requireOrganizationPermission(
        "admin-user-id",
        "org-public-id",
        "MANAGE_ROLES",
      )).resolves.toMatchObject({ organization_id: "org-internal-id", role: "ADMIN" });

      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "DENY:MANAGE_ROLES" },
      ]);
      await expect(requireOrganizationPermission(
        "admin-user-id",
        "org-public-id",
        "MANAGE_ROLES",
      )).rejects.toThrow("Access denied: This role does not have the required permission.");
    });

    it("returns effective permissions after applying explicit denials to built-in defaults", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "DENY:VIEW_ORDERS" },
      ]);

      const permissions = await getOrganizationEffectivePermissions("admin-user-id", "org-public-id");

      expect(permissions).toContain("MANAGE_ROLES");
      expect(permissions).toContain("VIEW_INVENTORY_STOCK");
      expect(permissions).not.toContain("VIEW_ORDERS");
      expect(permissions).toContain("ACCESS_MODULE_ORDER_MANAGEMENT");
    });

    it("applies a module denial independently of granular permissions", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: `DENY:${getOrganizationModuleAccessPermission("order-management")}` },
      ]);

      const permissions = await getOrganizationEffectivePermissions("admin-user-id", "org-public-id");

      expect(permissions).not.toContain("ACCESS_MODULE_ORDER_MANAGEMENT");
      expect(permissions).toContain("ACCESS_MODULE_FACTORY_MANAGEMENT");
      expect(permissions).toContain("VIEW_ORDERS");
    });

    it("applies a sidebar-item denial independently of other items in the same module", async () => {
      const orderManagementItem = getOrganizationModuleNavigationItems("order-management")
        .find((item) => item.key === "merchandising")
        ?.children.find((item) => item.key === "order");
      expect(orderManagementItem).toBeTruthy();
      if (!orderManagementItem) throw new Error("Order Management route mapping is missing.");

      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: `DENY:${orderManagementItem.accessPermission}` },
      ]);

      const permissions = await getOrganizationEffectivePermissions("admin-user-id", "org-public-id");

      expect(permissions).not.toContain(orderManagementItem.accessPermission);
      expect(permissions).toContain("ACCESS_SUBMODULE:order-management:merchandising/bulk-order-creation");
      expect(permissions).toContain("ACCESS_MODULE_ORDER_MANAGEMENT");
    });

    it("preserves built-in Purchase Order responsibilities while requiring explicit custom-role grants", async () => {
      prismaMock.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: "viewer-membership",
          organization_id: "org-internal-id",
          role: "VIEWER",
        })
        .mockResolvedValueOnce({
          id: "approver-membership",
          organization_id: "org-internal-id",
          role: "APPROVER",
        })
        .mockResolvedValueOnce({
          id: "custom-membership",
          organization_id: "org-internal-id",
          role: "CUSTOM_PROCUREMENT",
        });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([]);

      await expect(requireOrganizationPermission(
        "viewer-user",
        "org-public-id",
        "VIEW_PURCHASE_ORDERS",
      )).resolves.toMatchObject({ role: "VIEWER" });
      await expect(requireOrganizationPermission(
        "approver-user",
        "org-public-id",
        "APPROVE_PURCHASE_ORDERS",
      )).resolves.toMatchObject({ role: "APPROVER" });
      await expect(requireOrganizationPermission(
        "custom-user",
        "org-public-id",
        "VIEW_PURCHASE_ORDERS",
      )).rejects.toThrow("Access denied: This role does not have the required permission.");
    });

    it("persists explicit denial markers when a role permission is revoked", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRoleDefinition.findUnique.mockResolvedValue({
        id: "admin-role-id",
        role_key: "ADMIN",
        is_system: true,
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "VIEW_REPORTS" },
        { permission: "MANAGE_USERS" },
        { permission: "MANAGE_ROLES" },
      ]);
      transactionMock.organizationMembership.groupBy.mockResolvedValue([
        { role: "ADMIN", _count: { _all: 1 } },
        { role: "OWNER", _count: { _all: 1 } },
      ]);
      transactionMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "VIEW_REPORTS" },
        { permission: "MANAGE_USERS" },
        { permission: "MANAGE_ROLES" },
      ]);

      await expect(updateOrganizationRolePermissions(
        "org-public-id",
        "admin-user-id",
        "ADMIN",
        ["VIEW_ORDERS"],
      )).resolves.toEqual({ role: "ADMIN", permissions: ["VIEW_ORDERS"] });

      expect(transactionMock.organizationRolePermission.deleteMany).toHaveBeenCalledWith({
        where: { organization_id: "org-internal-id", role: "ADMIN" },
      });
      expect(transactionMock.organizationRolePermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ organization_id: "org-internal-id", role: "ADMIN", permission: "VIEW_ORDERS" }),
          expect.objectContaining({ organization_id: "org-internal-id", role: "ADMIN", permission: "DENY:VIEW_REPORTS" }),
          expect.objectContaining({ organization_id: "org-internal-id", role: "ADMIN", permission: "DENY:MANAGE_USERS" }),
          expect.objectContaining({ organization_id: "org-internal-id", role: "ADMIN", permission: "DENY:MANAGE_ROLES" }),
        ]),
      });
      expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          module: "ORGANIZATION_ACCESS",
          action: "ROLE_PERMISSIONS_UPDATED",
          user_id: "admin-user-id",
        }),
      }));
    });

    it("prevents revoking role-management access from the last active administrator role", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "ADMIN",
      });
      prismaMock.organizationRoleDefinition.findUnique.mockResolvedValue({
        id: "admin-role-id",
        role_key: "ADMIN",
        is_system: true,
      });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { role: "ADMIN", permission: "MANAGE_ROLES" },
      ]);
      transactionMock.organizationMembership.groupBy.mockResolvedValue([
        { role: "ADMIN", _count: { _all: 1 } },
      ]);
      transactionMock.organizationRolePermission.findMany.mockResolvedValue([
        { role: "ADMIN", permission: "MANAGE_ROLES" },
      ]);

      await expect(updateOrganizationRolePermissions(
        "org-public-id",
        "admin-user-id",
        "ADMIN",
        ["VIEW_ORDERS"],
      )).rejects.toThrow("Keep role-management access for at least one active organization administrator.");

      expect(transactionMock.organizationRolePermission.deleteMany).not.toHaveBeenCalled();
    });

    it("applies the administrator recovery guard when updating a custom role", async () => {
      prismaMock.organizationMembership.findFirst.mockResolvedValue({
        id: "membership-id",
        organization_id: "org-internal-id",
        role: "OWNER",
      });
      prismaMock.organizationRoleDefinition.findUnique.mockResolvedValue({
        id: "custom-role-id",
        role_key: "CUSTOM_ADMIN",
        label: "Custom admin",
        is_system: false,
      });
      transactionMock.organizationMembership.groupBy.mockResolvedValue([
        { role: "CUSTOM_ADMIN", _count: { _all: 1 } },
      ]);
      transactionMock.organizationRolePermission.findMany.mockResolvedValue([
        { role: "CUSTOM_ADMIN", permission: "MANAGE_ROLES" },
      ]);
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { role: "CUSTOM_ADMIN", permission: "MANAGE_ROLES" },
      ]);

      await expect(updateOrganizationRole(
        "org-public-id",
        "owner-user-id",
        "CUSTOM_ADMIN",
        "Custom Admin",
        ["VIEW_ORDERS"],
      )).rejects.toThrow("Keep role-management access for at least one active organization administrator.");

      expect(transactionMock.organizationRolePermission.deleteMany).not.toHaveBeenCalled();
    });

    it("audits tenant-scoped member role changes in the same transaction", async () => {
      prismaMock.organizationMembership.findFirst
        .mockResolvedValueOnce({
          id: "actor-membership",
          organization_id: "org-internal-id",
          role: "ADMIN",
        })
        .mockResolvedValueOnce({
          id: "member-membership",
          role: "VIEWER",
          is_active: true,
        });
      prismaMock.organizationRolePermission.findMany.mockResolvedValue([
        { permission: "MANAGE_USERS" },
      ]);
      prismaMock.organizationRoleDefinition.findUnique.mockResolvedValue({
        id: "viewer-role-id",
      });
      transactionMock.organizationMembership.update.mockResolvedValue({
        id: "member-membership",
        organization_id: "org-internal-id",
        role: "FINANCE",
        is_active: true,
      });

      await expect(updateOrganizationMember(
        "member-membership",
        "org-public-id",
        "admin-user-id",
        { role: "FINANCE", is_active: true },
      )).resolves.toMatchObject({ role: "FINANCE", is_active: true });

      expect(transactionMock.organizationMembership.update).toHaveBeenCalledWith({
        where: { id: "member-membership", organization_id: "org-internal-id" },
        data: { role: "FINANCE", is_active: true },
      });
      expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "org-internal-id",
          user_id: "admin-user-id",
          action: "MEMBERSHIP_UPDATED",
          details: expect.objectContaining({ previous_role: "VIEWER", role: "FINANCE" }),
        }),
      }));
    });
  });
});

describe("organization onboarding count", () => {
  it("counts only organizations with an active membership for the authenticated workspace user", async () => {
    prismaMock.organization.count.mockResolvedValue(0);

    await expect(countOrganizationsForUser("workspace-user-id")).resolves.toBe(0);
    expect(prismaMock.organization.count).toHaveBeenCalledWith({
      where: {
        memberships: {
          some: { workspace_user_id: "workspace-user-id", is_active: true },
        },
      },
    });
  });
});

describe("organization membership existence", () => {
  it("checks the authenticated user's active membership without counting every organization", async () => {
    prismaMock.organizationMembership.findFirst.mockResolvedValue({ id: "membership-id" });

    await expect(hasOrganizationsForUser("workspace-user-id")).resolves.toBe(true);
    expect(prismaMock.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: { workspace_user_id: "workspace-user-id", is_active: true },
      select: { id: true },
    });
    expect(prismaMock.organization.count).not.toHaveBeenCalled();
  });
});

describe("organization archive lifecycle", () => {
  it("requires owner membership and exact organization-name confirmation", async () => {
    transactionMock.organization.findFirst.mockResolvedValue(organization);

    await expect(archiveOrganization("org-internal-id", "owner-id", "Northwind"))
      .rejects.toThrow("Organization name confirmation did not match.");
    expect(transactionMock.organization.updateMany).not.toHaveBeenCalled();
    expect(transactionMock.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberships: { some: { workspace_user_id: "owner-id", role: "OWNER", is_active: true } },
      }),
    }));

    transactionMock.organization.findFirst.mockResolvedValue(null);
    await expect(archiveOrganization("org-internal-id", "viewer-id", "Northwind Apparel"))
      .rejects.toThrow("Organization not found or owner access required.");
  });

  it("archives without deleting data and records the acting owner for the audit trigger", async () => {
    transactionMock.organization.findFirst.mockResolvedValue(organization);
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });

    await expect(archiveOrganization("org-internal-id", "owner-id", "Northwind Apparel"))
      .resolves.toEqual({ archived: true, organizationId: "org-public-id" });

    expect(transactionMock.$executeRaw).toHaveBeenCalled();
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "APPROVED" },
      data: { approval_status: "ARCHIVED", archived_at: expect.any(Date), is_active: false },
    });
  });

  it("restores to inactive pending approval, never directly to operational", async () => {
    transactionMock.organization.findFirst.mockResolvedValue({
      id: "org-internal-id",
      organization_id: "org-public-id",
    });
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });

    await expect(restoreOrganization("org-internal-id", "owner-id"))
      .resolves.toEqual({ restored: true, organizationId: "org-public-id" });

    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "ARCHIVED" },
      data: { approval_status: "PENDING_APPROVAL", archived_at: null, is_active: false },
    });
  });

  it("makes deletion available exactly 90 days after archival", () => {
    const archivedAt = new Date("2026-01-01T12:00:00.000Z");
    const eligibleAt = new Date("2026-04-01T12:00:00.000Z");

    expect(getOrganizationDeletionEligibility(archivedAt, new Date(eligibleAt.getTime() - 1)).isEligible).toBe(false);
    expect(getOrganizationDeletionEligibility(archivedAt, eligibleAt)).toEqual({ eligibleAt, isEligible: true });
    expect(getOrganizationDeletionEligibility(null, eligibleAt)).toEqual({ eligibleAt: null, isEligible: false });
  });

  it("blocks platform deletion unless the organization is archived for 90 days", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      archived_at: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000),
    });

    await expect(deleteOrganizationFromPlatform("org-internal-id"))
      .rejects.toThrow("Organizations can only be deleted 90 days after archiving.");
    expect(requirePlatformSessionSuperAdmin).toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("blocks Admin-view accounts from deleting organizations", async () => {
    requirePlatformSessionSuperAdmin.mockRejectedValue(
      new Error("This action requires Super Admin access."),
    );

    await expect(deleteOrganizationFromPlatform("org-internal-id"))
      .rejects.toThrow("This action requires Super Admin access.");
    await expect(forceDeleteOrganizationFromPlatform("org-internal-id", "Northwind"))
      .rejects.toThrow("This action requires Super Admin access.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("blocks platform deletion for an organization that is not archived", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await expect(deleteOrganizationFromPlatform("org-internal-id"))
      .rejects.toThrow("Only archived organizations can be deleted.");
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("deletes an organization once its archived retention period has elapsed", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      archived_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });

    await deleteOrganizationFromPlatform("org-internal-id");

    expect(transactionMock.organization.delete).toHaveBeenCalledWith({ where: { id: "org-internal-id" } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 20000,
      timeout: 150000,
    });
  });

  it("force deletes an organization without archive or retention eligibility and records the platform admin", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      organization_name: "Northwind Apparel",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await forceDeleteOrganizationFromPlatform("org-internal-id", "Northwind Apparel");

    expect(requirePlatformSessionSuperAdmin).toHaveBeenCalled();
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-id",
        action: "ORGANIZATION_FORCE_DELETED",
        entity_type: "Organization",
        entity_id: "org-internal-id",
        details: {
          organizationName: "Northwind Apparel",
          approvalStatus: "APPROVED",
          archivedAt: null,
          bypassedRetention: true,
        },
      },
    });
    expect(transactionMock.organization.delete).toHaveBeenCalledWith({ where: { id: "org-internal-id" } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 20000,
      timeout: 150000,
    });
  });

  it("requires an exact organization name before force deletion", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      organization_name: "Northwind Apparel",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await expect(forceDeleteOrganizationFromPlatform("org-internal-id", "Northwind"))
      .rejects.toThrow("Organization name confirmation did not match.");

    expect(transactionMock.platformAuditEvent.create).not.toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("does not audit or delete when force-delete cannot find the organization", async () => {
    transactionMock.organization.findUnique.mockResolvedValue(null);

    await expect(forceDeleteOrganizationFromPlatform("missing-organization", "Northwind Apparel"))
      .rejects.toThrow("Organization not found.");

    expect(transactionMock.platformAuditEvent.create).not.toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("does not let approval changes reactivate an archived organization", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 0 });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      platform_version_id: null,
      platformVersion: null,
    });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .rejects.toThrow("Restore the organization from its workspace before changing its approval status.");
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
  });

  it("allows approval when a platform version is assigned", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.organization.findUnique
      .mockResolvedValueOnce({
        approval_status: "APPROVED",
        trial_started_at: null,
        trial_enabled: true,
        trial_extension_hours: 0,
      })
      .mockResolvedValueOnce({
      ...organization,
      platform_version_id: "version-id",
      platformVersion: { is_active: true },
      });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .resolves.toEqual({ ...organization, platform_version_id: "version-id", platformVersion: { is_active: true } });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "APPROVED", trial_started_at: null, trial_enabled: true },
      data: {
        trial_started_at: expect.any(Date),
        trial_ends_at: expect.any(Date),
      },
    });
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platform_admin_id: "platform-admin-id", action: "ORGANIZATION_TRIAL_STARTED" }),
    }));
  });

  it("allows approval when no platform version is assigned", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.organization.findUnique
      .mockResolvedValueOnce({
        approval_status: "APPROVED",
        trial_started_at: null,
        trial_enabled: true,
        trial_extension_hours: 0,
      })
      .mockResolvedValueOnce({
        ...organization,
        platform_version_id: null,
        platformVersion: null,
      });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .resolves.toEqual({ ...organization, platform_version_id: null, platformVersion: null });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platform_admin_id: "platform-admin-id", action: "ORGANIZATION_TRIAL_STARTED" }),
    }));
  });

  it("rejects approval when the assigned platform version is inactive", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 0 });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "PENDING_APPROVAL",
      platform_version_id: "version-id",
      platformVersion: { is_active: false },
    });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .rejects.toThrow("Assign an active platform version before approving this organization.");
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
  });
});
