import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformSessionAdminMock,
  prismaMock,
  findLeadsMock,
  findWorkspaceUsersMock,
  createLeadMock,
  createLeadsMock,
  findLeadMock,
  findLeadStagesMock,
  updateLeadMock,
  updateLeadStagesMock,
  createAuditEventMock,
  createAuditEventsMock,
} = vi.hoisted(() => {
  const findLeads = vi.fn();
  const findWorkspaceUsers = vi.fn();
  const createLead = vi.fn();
  const createLeads = vi.fn();
  const findLead = vi.fn();
  const findLeadStages = vi.fn();
  const updateLead = vi.fn();
  const updateLeadStages = vi.fn();
  const createAuditEvent = vi.fn();
  const createAuditEvents = vi.fn();
  const transaction = {
    platformLead: {
      create: createLead,
      createMany: createLeads,
      findUnique: findLead,
      findMany: findLeadStages,
      update: updateLead,
      updateMany: updateLeadStages,
    },
    platformAuditEvent: { create: createAuditEvent, createMany: createAuditEvents },
  };
  const prisma = {
    platformLead: {
      findMany: findLeads,
      findUnique: findLead,
      createMany: createLeads,
      update: updateLead,
    },
    workspaceUser: { findMany: findWorkspaceUsers },
    platformAuditEvent: { create: createAuditEvent, createMany: createAuditEvents },
    $transaction: vi.fn((operation: unknown) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : (operation as (tx: typeof transaction) => unknown)(transaction),
    ),
  };
  return {
    requirePlatformSessionAdminMock: vi.fn(),
    prismaMock: prisma,
    findLeadsMock: findLeads,
    findWorkspaceUsersMock: findWorkspaceUsers,
    createLeadMock: createLead,
    createLeadsMock: createLeads,
    findLeadMock: findLead,
    findLeadStagesMock: findLeadStages,
    updateLeadMock: updateLead,
    updateLeadStagesMock: updateLeadStages,
    createAuditEventMock: createAuditEvent,
    createAuditEventsMock: createAuditEvents,
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

import {
  createPlatformLead,
  importPlatformLeads,
  listPlatformLeadAppLogins,
  listPlatformLeads,
  updatePlatformLeadStage,
  updateNewPlatformLeadStages,
  updatePlatformLeadStages,
  movePlatformLeadStages,
  updatePlatformLead,
} from "@/lib/services/platform/platform-lead-service";
import {
  PLATFORM_LEAD_DEAD_STAGES,
  PLATFORM_LEAD_STAGES,
  PLATFORM_LEAD_THIRD_PARTY_STAGES,
  PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES,
  PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES,
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
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-1" });
  });

  it("places 3-Dead after Potential Dead in 3rd Party, not the Dead tab", () => {
    expect(PLATFORM_LEAD_STAGES.indexOf("3-Dead"))
      .toBe(PLATFORM_LEAD_STAGES.indexOf("Potential Dead") + 1);
    expect(PLATFORM_LEAD_THIRD_PARTY_STAGES).toContain("3-Dead");
    expect(PLATFORM_LEAD_DEAD_STAGES).not.toContain("3-Dead");
  });

  it("places 2-Potential immediately after Demo Attended", () => {
    expect(PLATFORM_LEAD_STAGES.indexOf("2-Potential"))
      .toBe(PLATFORM_LEAD_STAGES.indexOf("Demo Attended") + 1);
  });

  it("groups verified statuses into interested and not-interested tabs", () => {
    expect(PLATFORM_LEAD_VERIFIED_INTERESTED_STAGES).toEqual([
      "Interested For Demo",
      "Demo Booked",
      "Demo Attended",
      "2-Potential",
    ]);
    expect(PLATFORM_LEAD_VERIFIED_NOT_INTERESTED_STAGES).toEqual([
      "Potential Dead",
      "3-Dead",
      "Testing WhatsApp msg",
    ]);
    expect(PLATFORM_LEAD_VERIFIED_STAGES).toContain("Verification");
    expect(PLATFORM_LEAD_VERIFIED_STAGES).toHaveLength(8);
  });

  it("updates a lead status and audits it in a short atomic batch", async () => {
    findLeadMock.mockResolvedValue({ id: "lead-1" });
    updateLeadMock.mockResolvedValue({ id: "lead-1", stage: "Verification" });
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(updatePlatformLeadStage("lead-1", " Verification ")).resolves.toEqual({
      id: "lead-1",
      stage: "Verification",
    });
    expect(updateLeadMock).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { stage: "Verification" },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "PLATFORM_LEAD_STAGE_UPDATED",
        entity_id: "lead-1",
        details: { stage: "Verification" },
      }),
    }));
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
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 2 });

    await expect(movePlatformLeadStages(["lead-1", "lead-2"], "NEXT")).resolves.toEqual({
      updatedCount: 2,
      skippedCount: 0,
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["lead-1"] }, stage: "1-new" },
      data: { stage: "Verification" },
    });
    expect(updateLeadStagesMock).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["lead-2"] }, stage: "Verification" },
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
          details: { previousStage: "Verification", stage: "Interested For Demo", direction: "NEXT" },
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
      data: { stage: "Verification" },
    });
  });

  it("moves selected New leads to Interested or Fraud and audits the change", async () => {
    findLeadStagesMock.mockResolvedValue([
      { id: "lead-1", stage: "1-new" },
      { id: "lead-2", stage: "1-new" },
    ]);
    updateLeadStagesMock.mockResolvedValue({ count: 2 });
    createAuditEventsMock.mockResolvedValue({ count: 2 });

    await expect(updateNewPlatformLeadStages(["lead-1", "lead-2"], "Interested For Demo"))
      .resolves.toEqual({ updatedCount: 2 });
    expect(updateLeadStagesMock).toHaveBeenCalledWith({
      where: { id: { in: ["lead-1", "lead-2"] }, stage: "1-new" },
      data: { stage: "Interested For Demo" },
    });
    expect(createAuditEventsMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entity_id: "lead-1",
          details: { previousStage: "1-new", stage: "Interested For Demo" },
        }),
      ]),
    });
  });

  it("rejects invalid target statuses and leads that are no longer New", async () => {
    await expect(updateNewPlatformLeadStages(["lead-1"], "Paid"))
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
    expect(requirePlatformSessionAdminMock).toHaveBeenCalledOnce();
    expect(findLeadsMock).toHaveBeenCalledWith({
      orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    });
  });

  it("lists logged-in workspace users with their active organization details", async () => {
    findWorkspaceUsersMock.mockResolvedValue([{
      id: "workspace-user-1",
      full_name: "Taylor Reed",
      email: "taylor@example.com",
      mobile_number: "+919876543210",
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
      last_login_at: new Date("2026-10-02T10:30:00Z"),
    }]);
    expect(requirePlatformSessionAdminMock).toHaveBeenCalledOnce();
    expect(findWorkspaceUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { last_login_at: { not: null } },
      orderBy: [{ last_login_at: "desc" }, { full_name: "asc" }],
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
        mobile: "+919876543210",
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

  it("saves the lead's nature of business after trimming and enforces its size limit", async () => {
    createLeadMock.mockResolvedValue({ id: "lead-1", name: "Taylor Reed" });
    await createPlatformLead({ ...validInput, natureOfBusiness: "  Apparel manufacturing  " });
    expect(createLeadMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nature_of_business: "Apparel manufacturing" }),
    }));

    await expect(createPlatformLead({ ...validInput, natureOfBusiness: "x".repeat(2001) }))
      .rejects.toThrow("Nature of business must be 2000 characters or fewer.");
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

  it("updates the selected lead and records changed fields", async () => {
    findLeadMock.mockResolvedValue({
      id: "lead-1",
      name: "Taylor Reed",
      email: "taylor@example.com",
      mobile: "+919876543210",
      company_name: "Acme Apparel",
      city: "Bengaluru",
      source: "Referral",
      stage: "1-new",
      nature_of_business: null,
    });
    updateLeadMock.mockResolvedValue({ id: "lead-1", name: "Taylor R." });

    await expect(updatePlatformLead("lead-1", { ...validInput, name: "Taylor R." }))
      .resolves.toEqual({ id: "lead-1", name: "Taylor R." });
    expect(updateLeadMock).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: {
        name: "Taylor R.",
        email: "taylor@example.com",
        mobile: "+919876543210",
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
        details: { changedFields: ["name"] },
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
    expect(updateLeadMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });
});
