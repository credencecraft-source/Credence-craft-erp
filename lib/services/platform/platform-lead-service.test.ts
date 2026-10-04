import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformSessionAdminMock,
  prismaMock,
  findLeadsMock,
  createLeadMock,
  createLeadsMock,
  findLeadMock,
  updateLeadMock,
  createAuditEventMock,
  createAuditEventsMock,
} = vi.hoisted(() => {
  const findLeads = vi.fn();
  const createLead = vi.fn();
  const createLeads = vi.fn();
  const findLead = vi.fn();
  const updateLead = vi.fn();
  const createAuditEvent = vi.fn();
  const createAuditEvents = vi.fn();
  const transaction = {
    platformLead: {
      create: createLead,
      createMany: createLeads,
      findUnique: findLead,
      update: updateLead,
    },
    platformAuditEvent: { create: createAuditEvent, createMany: createAuditEvents },
  };
  const prisma = {
    platformLead: { findMany: findLeads, createMany: createLeads },
    platformAuditEvent: { createMany: createAuditEvents },
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
    createLeadMock: createLead,
    createLeadsMock: createLeads,
    findLeadMock: findLead,
    updateLeadMock: updateLead,
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
  listPlatformLeads,
  updatePlatformLead,
} from "@/lib/services/platform/platform-lead-service";

const validInput = {
  name: " Taylor Reed ",
  email: " TAYLOR@example.com ",
  mobile: "+91 98765-43210",
  companyName: " Acme Apparel ",
  city: " Bengaluru ",
  source: " Referral ",
  stage: "1-new",
};

describe("platform lead management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-1" });
  });

  it("requires a platform session when listing leads", async () => {
    findLeadsMock.mockResolvedValue([]);

    await expect(listPlatformLeads()).resolves.toEqual([]);
    expect(requirePlatformSessionAdminMock).toHaveBeenCalledOnce();
    expect(findLeadsMock).toHaveBeenCalledWith({
      orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    });
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
