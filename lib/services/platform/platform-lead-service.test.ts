import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformNavigationPermissionMock,
  prismaMock,
  findLeadsMock,
  findWorkspaceUsersMock,
  findPlatformAdminMock,
  createLeadMock,
  createLeadsMock,
  findLeadMock,
  findLeadStagesMock,
  updateLeadMock,
  updateLeadStagesMock,
  createAuditEventMock,
  createAuditEventsMock,
  findLeadAuditEventsMock,
} = vi.hoisted(() => {
  const findLeads = vi.fn();
  const findWorkspaceUsers = vi.fn();
  const findPlatformAdmin = vi.fn();
  const findLeadVoiceNotes = vi.fn();
  const createLead = vi.fn();
  const createLeads = vi.fn();
  const findLead = vi.fn();
  const findLeadStages = vi.fn();
  const updateLead = vi.fn();
  const updateLeadStages = vi.fn();
  const createAuditEvent = vi.fn();
  const createAuditEvents = vi.fn();
  const findLeadAuditEvents = vi.fn();
  const transaction = {
    platformLead: {
      create: createLead,
      createMany: createLeads,
      findUnique: findLead,
      findFirst: findLead,
      findMany: findLeadStages,
      update: updateLead,
      updateMany: updateLeadStages,
    },
    platformAuditEvent: {
      create: createAuditEvent,
      createMany: createAuditEvents,
      findMany: findLeadAuditEvents,
    },
    platformAdmin: { findFirst: findPlatformAdmin },
  };
  const prisma = {
    platformLead: {
      findMany: findLeads,
      findUnique: findLead,
      findFirst: findLead,
      createMany: createLeads,
      update: updateLead,
    },
    workspaceUser: { findMany: findWorkspaceUsers },
    platformAdmin: { findFirst: findPlatformAdmin },
    platformLeadVoiceNote: { findMany: findLeadVoiceNotes },
    platformAuditEvent: {
      create: createAuditEvent,
      createMany: createAuditEvents,
      findMany: findLeadAuditEvents,
    },
    $transaction: vi.fn((operation: unknown) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : (operation as (tx: typeof transaction) => unknown)(transaction),
    ),
  };
  return {
    requirePlatformNavigationPermissionMock: vi.fn(),
    prismaMock: prisma,
    findLeadsMock: findLeads,
    findWorkspaceUsersMock: findWorkspaceUsers,
    findPlatformAdminMock: findPlatformAdmin,
    createLeadMock: createLead,
    createLeadsMock: createLeads,
    findLeadMock: findLead,
    findLeadStagesMock: findLeadStages,
    updateLeadMock: updateLead,
    updateLeadStagesMock: updateLeadStages,
    createAuditEventMock: createAuditEvent,
    createAuditEventsMock: createAuditEvents,
    findLeadAuditEventsMock: findLeadAuditEvents,
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformNavigationPermission: requirePlatformNavigationPermissionMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

import {
  createPlatformLead,
  assignPlatformLead,
  claimPlatformLead,
  importPlatformLeads,
  listPlatformLeadAppLogins,
  listPlatformLeads,
  updatePlatformLeadStage,
  updateNewPlatformLeadStages,
  updatePlatformLeadStages,
  movePlatformLeadStages,
  updatePlatformLead,
  listPlatformLeadStatusHistory,
  listPlatformLeadActivity,
  syncPlatformLeadsFromGoogleSheet,
  testPlatformGoogleSheetsLeadConnection,
} from "@/lib/services/platform/platform-lead-service";
import {
  PLATFORM_LEAD_DEAD_STAGES,
  PLATFORM_LEAD_NOT_INTERESTED_STAGES,
  PLATFORM_LEAD_STAGES,
  PLATFORM_LEAD_THIRD_PARTY_STAGES,
  PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
  PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES,
  PLATFORM_LEAD_VERIFIED_STAGES,
} from "@/lib/services/platform/platform-lead-constants";

const validInput = {
  name: " Taylor Reed ",
  email: " TAYLOR@example.com ",
  mobile: "+91 98765-43210",
  companyName: " Acme Apparel ",
  city: " Bengaluru ",
  source: " Referral ",
  stage: "1-new",
  natureOfBusiness: "",
};

describe("platform lead management", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    requirePlatformNavigationPermissionMock.mockResolvedValue({ id: "admin-1" });
  });

  it("keeps only canonical stages in the retired status groups", () => {
    expect(PLATFORM_LEAD_NOT_INTERESTED_STAGES).toEqual(["3-Dead"]);
    expect(PLATFORM_LEAD_THIRD_PARTY_STAGES).not.toContain("3-Dead");
    expect(PLATFORM_LEAD_DEAD_STAGES).not.toContain("3-Dead");
    expect(PLATFORM_LEAD_DEAD_STAGES).toEqual(["MARK AS FROUD"]);
    expect(PLATFORM_LEAD_STAGES).toContain("Old");
    expect(PLATFORM_LEAD_THIRD_PARTY_STAGES).not.toContain("Old");
    expect(PLATFORM_LEAD_STAGES).not.toContain("Potential Dead");
    expect(PLATFORM_LEAD_STAGES).not.toContain("Testing WhatsApp msg");
    expect(PLATFORM_LEAD_STAGES).not.toContain("Froud Verfication");
    expect(PLATFORM_LEAD_STAGES).not.toContain("Hello blocked");
  });

  it("places 2-Potential immediately after Demo Attended", () => {
    expect(PLATFORM_LEAD_STAGES.indexOf("2-Potential"))
      .toBe(PLATFORM_LEAD_STAGES.indexOf("Demo Attended") + 1);
  });

  it("groups call follow-up statuses after Verification and before Interested", () => {
    expect(PLATFORM_LEAD_STAGES.indexOf("Need To Call"))
      .toBe(PLATFORM_LEAD_STAGES.indexOf("Verification") + 1);
    expect(PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES).toEqual([
      "Need To Call",
      "Not Picked",
      "Call Back Later",
    ]);
    expect(PLATFORM_LEAD_STAGES.indexOf("Interested For Demo"))
      .toBe(PLATFORM_LEAD_STAGES.indexOf("Call Back Later") + 1);
    for (const stage of PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES) {
      expect(PLATFORM_LEAD_VERIFIED_STAGES).toContain(stage);
      expect(PLATFORM_LEAD_THIRD_PARTY_STAGES).toContain(stage);
    }
  });

  it("keeps not-interested statuses separate from third-party and verified leads", () => {
    expect(PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES).toEqual([
      "Interested For Demo",
      "Demo Booked",
      "Demo Attended",
      "2-Potential",
    ]);
    expect(PLATFORM_LEAD_NOT_INTERESTED_STAGES).toEqual(["3-Dead"]);
    expect(PLATFORM_LEAD_VERIFIED_STAGES).toEqual([
      "Verification",
      ...PLATFORM_LEAD_VERIFIED_NEED_TO_CALL_STAGES,
      ...PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
    ]);
    for (const stage of PLATFORM_LEAD_NOT_INTERESTED_STAGES) {
      expect(PLATFORM_LEAD_VERIFIED_STAGES).not.toContain(stage);
      expect(PLATFORM_LEAD_THIRD_PARTY_STAGES).not.toContain(stage);
    }
  });

  it("updates a lead status and audits it in a short atomic batch", async () => {
    findLeadMock
      .mockResolvedValueOnce({ id: "lead-1", stage: "1-new" })
      .mockResolvedValueOnce({ id: "lead-1", stage: "Verification" });
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(updatePlatformLeadStage("lead-1", " Verification ")).resolves.toEqual({
      id: "lead-1",
      stage: "Verification",
    });
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: "lead-1", stage: "1-new" },
      data: { stage: "Verification" },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_id: "lead-1",
        details: { previousStage: "1-new", stage: "Verification" },
      }),
    }));
  });

  it("lists recent lead status changes and excludes unrelated lead edits", async () => {
    findLeadMock.mockResolvedValue({ id: "lead-1" });
    findLeadAuditEventsMock.mockResolvedValue([
      {
        id: "event-1",
        action: "PLATFORM_LEAD_STAGE_MOVED",
        details: { previousStage: "Verification", stage: "Old" },
        created_at: new Date("2026-10-20T12:00:00Z"),
        platformAdmin: { full_name: "Admin User" },
      },
      {
        id: "event-2",
        action: "PLATFORM_LEAD_UPDATED",
        details: { changedFields: ["quickNote"] },
        created_at: new Date("2026-10-20T11:00:00Z"),
        platformAdmin: null,
      },
    ]);

    await expect(listPlatformLeadStatusHistory("lead-1")).resolves.toEqual([
      {
        id: "event-1",
        previousStage: "Verification",
        stage: "Old",
        actor: "Admin User",
        created_at: new Date("2026-10-20T12:00:00Z"),
      },
    ]);
    expect(findLeadAuditEventsMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entity_type: "PlatformLead",
        entity_id: "lead-1",
      }),
      take: 100,
    }));
  });

  it("lists lead status and voice-note activity with lead and actor labels", async () => {
    const voiceCreatedAt = new Date("2026-10-20T13:00:00Z");
    const statusChangedAt = new Date("2026-10-20T12:00:00Z");
    findLeadAuditEventsMock.mockResolvedValue([
      {
        id: "event-voice",
        action: "PLATFORM_LEAD_VOICE_NOTE_CREATED",
        entity_type: "PlatformLeadVoiceNote",
        entity_id: "voice-1",
        details: { leadId: "lead-1", source: "UPLOADED" },
        created_at: voiceCreatedAt,
        platformAdmin: { full_name: "Admin User", email: "admin@example.com" },
      },
      {
        id: "event-status",
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_type: "PlatformLead",
        entity_id: "lead-1",
        details: { previousStage: "Need To Call", stage: "Old" },
        created_at: statusChangedAt,
        platformAdmin: null,
      },
    ]);
    findLeadsMock.mockResolvedValue([{ id: "lead-1", name: "Taylor Reed" }]);

    await expect(listPlatformLeadActivity()).resolves.toEqual([
      {
        id: "event-voice",
        leadId: "lead-1",
        category: "VOICE_NOTE",
        summary: "Voice note uploaded",
        leadName: "Taylor Reed",
        actor: "Admin User",
        actorEmail: "admin@example.com",
        created_at: voiceCreatedAt,
      },
      {
        id: "event-status",
        leadId: "lead-1",
        category: "STATUS",
        summary: "Status changed from Need To Call to Old",
        leadName: "Taylor Reed",
        actor: "Platform team",
        actorEmail: null,
        created_at: statusChangedAt,
      },
    ]);
    expect(findLeadAuditEventsMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { entity_type: { in: ["PlatformLead", "PlatformLeadVoiceNote"] } },
      take: 100,
    }));
    expect(findLeadsMock).toHaveBeenCalledWith({
      where: { id: { in: ["lead-1"] } },
      select: { id: true, name: true },
    });
  });

  it("limits Sales Managers to assigned and unassigned leads for claiming", async () => {
      requirePlatformNavigationPermissionMock.mockResolvedValue({
        id: "sales-manager-1",
        actualRole: "ADMIN",
        team_role: "SALES_MANAGER",
      });
      findLeadsMock.mockResolvedValue([]);

      await expect(listPlatformLeads()).resolves.toEqual([]);

      expect(findLeadsMock).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          OR: [
            { assigned_sales_manager_id: null },
            { assigned_sales_manager_id: "sales-manager-1" },
          ],
        },
      }));
  });

  it("prevents a Sales Manager from opening another manager's lead", async () => {
      requirePlatformNavigationPermissionMock.mockResolvedValue({
        id: "sales-manager-1",
        actualRole: "ADMIN",
        team_role: "SALES_MANAGER",
      });
      findLeadMock.mockResolvedValue(null);

      await expect(updatePlatformLead("lead-owned-by-another-manager", validInput))
        .rejects.toThrow("Lead not found.");

      expect(findLeadMock).toHaveBeenCalledWith({
        where: {
          id: "lead-owned-by-another-manager",
          assigned_sales_manager_id: "sales-manager-1",
        },
      });
      expect(updateLeadStagesMock).not.toHaveBeenCalled();
  });

  it("claims an unassigned lead atomically and records the Sales Manager", async () => {
      requirePlatformNavigationPermissionMock.mockResolvedValue({
        id: "sales-manager-1",
        actualRole: "ADMIN",
        team_role: "SALES_MANAGER",
      });
      updateLeadStagesMock.mockResolvedValue({ count: 1 });
      findLeadMock.mockResolvedValue({
        id: "lead-1",
        assigned_sales_manager_id: "sales-manager-1",
        assignedSalesManager: { id: "sales-manager-1", full_name: "SALES MANAGER", email: "sales@example.com" },
        campaignEntries: [],
        mobile: null,
      });
      createAuditEventMock.mockResolvedValue({ id: "audit-1" });

      await expect(claimPlatformLead("lead-1")).resolves.toMatchObject({
        id: "lead-1",
        assigned_sales_manager_id: "sales-manager-1",
      });

      expect(updateLeadStagesMock).toHaveBeenCalledWith({
        where: { id: "lead-1", assigned_sales_manager_id: null },
        data: { assigned_sales_manager_id: "sales-manager-1" },
      });
      expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          platform_admin_id: "sales-manager-1",
          action: "PLATFORM_LEAD_CLAIMED",
          entity_id: "lead-1",
        }),
      }));
  });

  it("allows a CMO to assign a lead only to an active manager on their team", async () => {
      requirePlatformNavigationPermissionMock.mockResolvedValue({
        id: "cmo-1",
        actualRole: "ADMIN",
        team_role: "CMO",
      });
      findLeadMock.mockResolvedValue({ id: "lead-1", assigned_sales_manager_id: null });
      findPlatformAdminMock.mockResolvedValue({ id: "sales-manager-1" });
      updateLeadStagesMock.mockResolvedValue({ count: 1 });
      createAuditEventMock.mockResolvedValue({ id: "audit-1" });

      await expect(assignPlatformLead("lead-1", "sales-manager-1")).resolves.toEqual({
        id: "lead-1",
        assigned_sales_manager_id: "sales-manager-1",
      });

      expect(findPlatformAdminMock).toHaveBeenCalledWith({
        where: {
          id: "sales-manager-1",
          role: "ADMIN",
          team_role: "SALES_MANAGER",
          is_active: true,
          manager_id: "cmo-1",
        },
        select: { id: true },
      });
      expect(updateLeadStagesMock).toHaveBeenCalledWith({
        where: { id: "lead-1", assigned_sales_manager_id: null },
        data: { assigned_sales_manager_id: "sales-manager-1" },
    });
  });

  it("rejects invalid lead status before database writes", async () => {
    await expect(updatePlatformLeadStage("lead-1", "Unknown status"))
      .rejects.toThrow("Select a valid lead stage.");
    expect(findLeadMock).not.toHaveBeenCalled();
    expect(updateLeadMock).not.toHaveBeenCalled();
  });

  it("moves selected 3rd Party leads to their own next stages and audits each change", async () => {
    findLeadStagesMock.mockResolvedValue([
      { id: "lead-1", stage: "1-new" },
      { id: "lead-2", stage: "Verification" },
      { id: "lead-3", stage: "Need To Call" },
      { id: "lead-4", stage: "Not Picked" },
      { id: "lead-5", stage: "Call Back Later" },
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 5 });

    await expect(movePlatformLeadStages(["lead-1", "lead-2", "lead-3", "lead-4", "lead-5"], "NEXT")).resolves.toEqual({
      updatedCount: 5,
      skippedCount: 0,
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["lead-1"] }, stage: "1-new" },
      data: { stage: "Verification" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["lead-2"] }, stage: "Verification" },
      data: { stage: "Need To Call" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(3, {
      where: { id: { in: ["lead-3"] }, stage: "Need To Call" },
      data: { stage: "Not Picked" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(4, {
      where: { id: { in: ["lead-4"] }, stage: "Not Picked" },
      data: { stage: "Call Back Later" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(5, {
      where: { id: { in: ["lead-5"] }, stage: "Call Back Later" },
      data: { stage: "Interested For Demo" },
    });
    expect(createAuditEventsMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entity_id: "lead-1",
          details: { previousStage: "1-new", stage: "Verification", direction: "NEXT" },
        }),
        expect.objectContaining({
          entity_id: "lead-2",
          details: { previousStage: "Verification", stage: "Need To Call", direction: "NEXT" },
        }),
        expect.objectContaining({
          entity_id: "lead-3",
          details: { previousStage: "Need To Call", stage: "Not Picked", direction: "NEXT" },
        }),
        expect.objectContaining({
          entity_id: "lead-4",
          details: { previousStage: "Not Picked", stage: "Call Back Later", direction: "NEXT" },
        }),
        expect.objectContaining({
          entity_id: "lead-5",
          details: { previousStage: "Call Back Later", stage: "Interested For Demo", direction: "NEXT" },
        }),
      ],
    });
  });

  it("moves selected leads back and skips leads already at the first status", async () => {
    findLeadStagesMock.mockResolvedValue([
      { id: "lead-1", stage: "1-new" },
      { id: "lead-2", stage: "Interested For Demo" },
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });

    await expect(movePlatformLeadStages(["lead-1", "lead-2"], "PREVIOUS")).resolves.toEqual({
      updatedCount: 1,
      skippedCount: 1,
    });
    expect(updateLeadStagesMock).toHaveBeenCalledOnce();
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: { in: ["lead-2"] }, stage: "Interested For Demo" },
      data: { stage: "Call Back Later" },
    });
  });

  it("approves selected New leads into Verified and can mark New leads as fraud", async () => {
    findLeadStagesMock.mockResolvedValue([
      { id: "lead-1", stage: "1-new" },
      { id: "lead-2", stage: "1-new" },
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 2 });
    createAuditEventsMock.mockResolvedValue({ count: 2 });

    await expect(updateNewPlatformLeadStages(["lead-1", "lead-2"], "Verification"))
      .resolves.toEqual({ updatedCount: 2 });
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: { in: ["lead-1", "lead-2"] }, stage: "1-new" },
      data: { stage: "Verification" },
    });
    expect(createAuditEventsMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entity_id: "lead-1",
          details: { previousStage: "1-new", stage: "Verification" },
        }),
      ]),
    });

    vi.clearAllMocks();
    requirePlatformNavigationPermissionMock.mockResolvedValue({ id: "admin-1" });
    findLeadStagesMock.mockResolvedValue([{ id: "lead-3", stage: "1-new" }]);
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });

    await expect(updateNewPlatformLeadStages(["lead-3"], "MARK AS FROUD"))
      .resolves.toEqual({ updatedCount: 1 });
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: { in: ["lead-3"] }, stage: "1-new" },
      data: { stage: "MARK AS FROUD" },
    });
  });

  it("rejects invalid target statuses and leads that are no longer New", async () => {
    await expect(updateNewPlatformLeadStages(["lead-1"], "Interested For Demo"))
      .rejects.toThrow("Select a valid status for new leads.");
    findLeadStagesMock.mockResolvedValue([{ id: "lead-1", stage: "Verification" }]);
    await expect(updateNewPlatformLeadStages(["lead-1"], "MARK AS FROUD"))
      .rejects.toThrow("Only leads currently in New can use these actions. Refresh and try again.");
    expect(updateLeadStagesMock).not.toHaveBeenCalled();
  });

  it("bulk changes selected lead stages atomically and audits each changed lead", async () => {
    findLeadStagesMock.mockResolvedValue([
      { id: "lead-1", stage: "1-new" },
      { id: "lead-2", stage: "Verification" },
      { id: "lead-3", stage: "Interested For Demo" },
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 2 });

    await expect(updatePlatformLeadStages(
      ["lead-1", "lead-2", "lead-3"],
      " Interested For Demo ",
    )).resolves.toEqual({ updatedCount: 2, unchangedCount: 1 });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["lead-1"] }, stage: "1-new" },
      data: { stage: "Interested For Demo" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["lead-2"] }, stage: "Verification" },
      data: { stage: "Interested For Demo" },
    });
    expect(createAuditEventsMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entity_id: "lead-1",
          details: { previousStage: "1-new", stage: "Interested For Demo" },
        }),
        expect.objectContaining({
          entity_id: "lead-2",
          details: { previousStage: "Verification", stage: "Interested For Demo" },
        }),
      ],
    });
  });

  it("rejects invalid bulk stage input before database writes", async () => {
    await expect(updatePlatformLeadStages(["lead-1"], "Unknown stage"))
      .rejects.toThrow("Select a valid lead stage.");
    await expect(updatePlatformLeadStages(["lead-1", "lead-1"], "Paid"))
      .rejects.toThrow("Select valid leads.");
    expect(findLeadStagesMock).not.toHaveBeenCalled();
    expect(updateLeadStagesMock).not.toHaveBeenCalled();
  });

  it("rejects non-3rd-Party leads and changed records atomically", async () => {
    findLeadStagesMock.mockResolvedValue([{ id: "lead-1", stage: "Paid" }]);
    await expect(movePlatformLeadStages(["lead-1"], "NEXT"))
      .rejects.toThrow("Only 3rd Party leads can be moved between statuses.");
    expect(updateLeadStagesMock).not.toHaveBeenCalled();

    findLeadStagesMock.mockResolvedValue([{ id: "lead-2", stage: "1-new" }]);
    updateLeadStagesMock.mockResolvedValue({ count: 0 });
    await expect(movePlatformLeadStages(["lead-2"], "NEXT"))
      .rejects.toThrow("A selected lead changed status. Refresh and try again.");
    expect(createAuditEventsMock).not.toHaveBeenCalled();
  });

  it("requires a platform session when listing leads", async () => {
    findLeadsMock.mockResolvedValue([]);

    await expect(listPlatformLeads()).resolves.toEqual([]);
    expect(requirePlatformNavigationPermissionMock).toHaveBeenCalledWith("canAccessLeads");
    expect(findLeadsMock).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ created_at: "desc" }, { name: "asc" }],
      include: {
        assignedSalesManager: { select: { id: true, full_name: true, email: true } },
        campaignEntries: {
          orderBy: { added_at: "desc" },
          take: 1,
          select: {
            added_at: true,
            campaign: { select: { campaign_date: true } },
          },
        },
      },
    });
  });

  it("lists logged-in workspace users with their active organization details", async () => {
    findWorkspaceUsersMock.mockResolvedValue([{
      id: "workspace-user-1",
      full_name: "Taylor Reed",
      email: "taylor@example.com",
      mobile_number: "+919876543210",
      created_at: new Date("2025-01-15T08:00:00Z"),
      last_login_at: new Date("2026-10-02T10:30:00Z"),
      organizationMemberships: [
        { organization: { organization_name: "Acme Apparel", city: " Bengaluru ", is_active: true } },
        { organization: { organization_name: "Inactive Co", city: "Pune", is_active: false } },
      ],
    }]);

    await expect(listPlatformLeadAppLogins()).resolves.toEqual([{
      id: "workspace-user-1",
      name: "Taylor Reed",
      email: "taylor@example.com",
      mobile: "+919876543210",
      company_name: "Acme Apparel",
      city: "Bengaluru",
      source: "App login",
      stage: "Logged in",
      created_at: new Date("2025-01-15T08:00:00Z"),
      last_login_at: new Date("2026-10-02T10:30:00Z"),
    }]);
    expect(requirePlatformNavigationPermissionMock).toHaveBeenCalledWith("canAccessLeadsAndSubscriptions");
    expect(findWorkspaceUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { last_login_at: { not: null } },
      orderBy: [{ created_at: "desc" }, { full_name: "asc" }],
      select: expect.objectContaining({ created_at: true }),
    }));
  });

  it("normalizes lead contact details and audits creation", async () => {
    createLeadMock.mockResolvedValue({ id: "lead-1", name: "Taylor Reed" });

    await expect(createPlatformLead(validInput)).resolves.toEqual({
      id: "lead-1",
      name: "Taylor Reed",
    });
    expect(createLeadMock).toHaveBeenCalledWith({
      data: {
        name: "Taylor Reed",
        email: "taylor@example.com",
        mobile: "919876543210",
        company_name: "Acme Apparel",
        city: "Bengaluru",
        source: "Referral",
        stage: "1-new",
        nature_of_business: null,
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform_admin_id: "admin-1",
        action: "PLATFORM_LEAD_CREATED",
        entity_type: "PlatformLead",
        entity_id: "lead-1",
      }),
    });
  });

  it("adds the Indian country code on creation and workbook import, and rejects other lengths", async () => {
    createLeadMock.mockResolvedValue({ id: "lead-1" });
    await createPlatformLead({ ...validInput, mobile: "9876543210" });
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mobile: "919876543210" }),
    }));

    createLeadsMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });
    await importPlatformLeads([{ ...validInput, mobile: "9876543210" }]);
    expect(createLeadsMock.mock.calls.at(-1)?.[0].data[0]).toEqual(
      expect.objectContaining({ mobile: "919876543210" }),
    );

    await expect(createPlatformLead({ ...validInput, mobile: "987654321" }))
      .rejects.toThrow("Mobile number must be 12 digits");
  });

  it("saves the lead's nature of business after trimming and enforces its size limit", async () => {
    createLeadMock.mockResolvedValue({ id: "lead-1", name: "Taylor Reed" });
    await createPlatformLead({ ...validInput, natureOfBusiness: "  Apparel manufacturing  " });
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nature_of_business: "Apparel manufacturing" }),
    }));

    await expect(createPlatformLead({ ...validInput, natureOfBusiness: "x".repeat(2001) }))
      .rejects.toThrow("Nature of business must be 2000 characters or fewer.");
  });

  it("normalizes quick notes, enforces their size limit, and preserves omitted notes", async () => {
    createLeadMock.mockResolvedValue({ id: "lead-1", name: "Taylor Reed" });
    await createPlatformLead({ ...validInput, quickNote: "  call back next week  " });
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quick_note: "CALL BACK NEXT WEEK" }),
    }));

    await expect(createPlatformLead({ ...validInput, quickNote: "x".repeat(2001) }))
      .rejects.toThrow("Quick note must be 2000 characters or fewer.");

    findLeadMock
      .mockResolvedValueOnce({ id: "lead-1", quick_note: "EXISTING NOTE" })
      .mockResolvedValueOnce({ id: "lead-1", quick_note: "EXISTING NOTE" });
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    await updatePlatformLead("lead-1", validInput);
    expect(updateLeadStagesMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead-1" },
      data: expect.not.objectContaining({ quick_note: expect.anything() }),
    }));
  });

  it("imports validated rows and audits every created lead", async () => {
    createLeadsMock.mockResolvedValue({ count: 2 });
    createAuditEventsMock.mockResolvedValue({ count: 2 });

    await expect(importPlatformLeads([
      validInput,
      { ...validInput, name: "Morgan Lee", email: "morgan@example.com" },
    ])).resolves.toHaveLength(2);

    expect(createLeadsMock).toHaveBeenCalledOnce();
    expect(createAuditEventsMock).toHaveBeenCalledOnce();
    const insertedLeads = createLeadsMock.mock.calls[0][0].data;
    const insertedAudits = createAuditEventsMock.mock.calls[0][0].data;
    expect(insertedLeads).toHaveLength(2);
    expect(insertedAudits).toHaveLength(2);
    expect(insertedAudits.map((audit: { entity_id: string }) => audit.entity_id))
      .toEqual(insertedLeads.map((lead: { id: string }) => lead.id));
    expect(insertedAudits[0]).toMatchObject({
      platform_admin_id: "admin-1",
      action: "PLATFORM_LEAD_IMPORTED",
      entity_type: "PlatformLead",
      details: {
        companyName: "Acme Apparel",
        source: "Referral",
        stage: "1-new",
      },
    });
  });

  it("syncs Google Sheet rows as new leads and skips known or repeated contacts", async () => {
    vi.stubEnv("GOOGLE_SHEETS_LEADS_WEB_APP_URL", "https://script.google.com/macros/s/deployment-id/exec");
    findLeadsMock.mockResolvedValue([
      { email: "taylor@example.com", mobile: "+919876543210" },
    ]);
    createLeadsMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      leads: [
        { ...validInput, name: "Taylor Reed", mobile: "p:+91 98765-43210" },
        { ...validInput, name: "Morgan Lee", email: "morgan@example.com", mobile: "+919812345678" },
        { ...validInput, name: "Morgan Duplicate", email: "morgan@example.com", mobile: "+919812345678" },
        { ...validInput, name: "<test lead: dummy data for full_name>", mobile: "p:<test lead: dummy data for phone_number>" },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncPlatformLeadsFromGoogleSheet("https://script.google.com/macros/s/deployment-id/exec")).resolves.toEqual({
      imported: 1,
      skippedDuplicates: 2,
    });
    expect(fetchMock.mock.calls[0][0]).toEqual(
      new URL("https://script.google.com/macros/s/deployment-id/exec"),
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
    });
    expect(createLeadsMock.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        name: "MORGAN LEE",
        email: "morgan@example.com",
        mobile: "919812345678",
        stage: "1-new",
      }),
    ]);
    expect(createAuditEventsMock.mock.calls[0][0].data[0]).toMatchObject({
      platform_admin_id: "admin-1",
      action: "PLATFORM_LEAD_GOOGLE_SHEET_IMPORTED",
      details: { stage: "1-new" },
    });
  });

  it("accepts numeric Google Sheets mobile cells and stores the canonical 12 digits", async () => {
    vi.stubEnv("GOOGLE_SHEETS_LEADS_WEB_APP_URL", "https://script.google.com/macros/s/deployment-id/exec");
    findLeadsMock.mockResolvedValue([]);
    createLeadsMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      leads: [{
        name: "Taylor Reed",
        email: "taylor@example.com",
        mobile: 9876543210,
        companyName: "Acme Apparel",
        city: "Bengaluru",
        source: "Google Sheets",
        natureOfBusiness: "",
      }],
    }), { status: 200 })));

    await expect(syncPlatformLeadsFromGoogleSheet(
      "https://script.google.com/macros/s/deployment-id/exec",
    )).resolves.toEqual({ imported: 1, skippedDuplicates: 0 });
    expect(createLeadsMock.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ mobile: "919876543210" }),
    );
  });

  it("does not contact the sheet when platform authorization fails", async () => {
    vi.stubEnv("GOOGLE_SHEETS_LEADS_WEB_APP_URL", "https://script.google.com/macros/s/deployment-id/exec");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    requirePlatformNavigationPermissionMock.mockRejectedValue(new Error("Not authorized."));

    await expect(syncPlatformLeadsFromGoogleSheet("https://script.google.com/macros/s/deployment-id/exec")).rejects.toThrow("Not authorized.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createLeadsMock).not.toHaveBeenCalled();
  });

  it("tests the Google Sheets URL without writing configuration data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      leads: [{ name: "Taylor Reed", email: "taylor@example.com", mobile: "", companyName: "", city: "", source: "", natureOfBusiness: "" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testPlatformGoogleSheetsLeadConnection(
      "https://script.google.com/macros/s/deployment-id/exec",
    )).resolves.toEqual({ connected: true, availableLeads: 1 });
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("fails the Google Sheets connection test when the endpoint returns an error payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "Unauthorized",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testPlatformGoogleSheetsLeadConnection(
      "https://script.google.com/macros/s/deployment-id/exec",
    )).rejects.toThrow("Google Sheets could not provide lead data. Check that the Apps Script is saved and redeployed.");
  });

  it("explains when the Apps Script deployment returns an HTML page instead of JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      "<!doctype html><html><body>Sign in</body></html>",
      { status: 200, headers: { "Content-Type": "text/html" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testPlatformGoogleSheetsLeadConnection(
      "https://script.google.com/macros/s/deployment-id/exec",
    )).rejects.toThrow("Google Apps Script returned an HTML page instead of JSON. Replace its code with the provided doGet script, save, then update the web-app deployment to execute as you with access set to Anyone.");
  });

  it("rejects invalid rows before writing any imported leads", async () => {
    await expect(importPlatformLeads([
      validInput,
      { ...validInput, name: "Morgan Lee", stage: "Not a configured stage" },
    ])).rejects.toThrow("Row 3: Select a valid lead stage.");

    expect(createLeadsMock).not.toHaveBeenCalled();
    expect(createAuditEventsMock).not.toHaveBeenCalled();
  });

  it("requires at least one lead contact method", async () => {
    await expect(createPlatformLead({ ...validInput, email: "", mobile: "" }))
      .rejects.toThrow("Provide an email address or mobile number.");
    expect(createLeadMock).not.toHaveBeenCalled();
  });

  it("normalizes Google Sheet phone prefixes and skips placeholder test leads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      leads: [
        {
          name: "Taylor Reed",
          email: "",
          mobile: "p:+91 88583-37112",
          companyName: "Vinay Gupta",
          city: "Gorakhpur",
          source: "Google Sheets",
          natureOfBusiness: "",
        },
        {
          name: "<test lead: dummy data for full_name>",
          email: "",
          mobile: "p:<test lead: dummy data for phone_number>",
          companyName: "<test lead: dummy data for company_name>",
          city: "<test lead: dummy data for city>",
          source: "Google Sheets",
          natureOfBusiness: "",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testPlatformGoogleSheetsLeadConnection(
      "https://script.google.com/macros/s/deployment-id/exec",
    )).resolves.toEqual({ connected: true, availableLeads: 1 });
  });

  it("updates the selected lead and records changed fields", async () => {
    findLeadMock
      .mockResolvedValueOnce({
      id: "lead-1",
      name: "Taylor Reed",
      email: "taylor@example.com",
      mobile: "+919876543210",
      company_name: "Acme Apparel",
      city: "Bengaluru",
      source: "Referral",
      stage: "1-new",
      nature_of_business: null,
      })
      .mockResolvedValueOnce({ id: "lead-1", name: "Taylor R." });
    updateLeadStagesMock.mockResolvedValue({ count: 1 });

    await expect(updatePlatformLead("lead-1", { ...validInput, name: "Taylor R." }))
      .resolves.toEqual({ id: "lead-1", name: "Taylor R." });
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: {
        name: "Taylor R.",
        email: "taylor@example.com",
        mobile: "919876543210",
        company_name: "Acme Apparel",
        city: "Bengaluru",
        source: "Referral",
        stage: "1-new",
        nature_of_business: null,
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLATFORM_LEAD_UPDATED",
        entity_id: "lead-1",
        details: { changedFields: ["name", "mobile"] },
      }),
    });
  });

  it("rejects lead stages outside the configured options", async () => {
    await expect(createPlatformLead({ ...validInput, stage: "Unapproved stage" }))
      .rejects.toThrow("Select a valid lead stage.");
    expect(createLeadMock).not.toHaveBeenCalled();
  });

  it("does not update a lead that does not exist", async () => {
    findLeadMock.mockResolvedValue(null);

    await expect(updatePlatformLead("missing-lead", validInput)).rejects.toThrow("Lead not found.");
    expect(updateLeadStagesMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });
});
