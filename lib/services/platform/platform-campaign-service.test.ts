import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformSessionAdminMock,
  findCampaignsMock,
  findCampaignMock,
  createCampaignMock,
  findLeadsMock,
  findCampaignEntriesMock,
  findCampaignEntryMock,
  deleteCampaignEntryMock,
  findCampaignMessagesMock,
  updateCampaignMessagesMock,
  deleteCampaignMock,
  createCampaignEntriesMock,
  createAuditEventMock,
  createAuditEventsMock,
  prismaMock,
} = vi.hoisted(() => {
  const findCampaigns = vi.fn();
  const findCampaign = vi.fn();
  const createCampaign = vi.fn();
  const findLeads = vi.fn();
  const findCampaignEntries = vi.fn();
  const findCampaignEntry = vi.fn();
  const deleteCampaignEntry = vi.fn();
  const findCampaignMessages = vi.fn();
  const updateCampaignMessages = vi.fn();
  const deleteCampaign = vi.fn();
  const createCampaignEntries = vi.fn();
  const createAuditEvent = vi.fn();
  const createAuditEvents = vi.fn();
  const transaction = {
    platformLead: { findMany: findLeads },
    platformCampaignLead: {
      findMany: findCampaignEntries,
      findUnique: findCampaignEntry,
      delete: deleteCampaignEntry,
      createMany: createCampaignEntries,
    },
    platformWhatsAppCampaignMessage: {
      findMany: findCampaignMessages,
      updateMany: updateCampaignMessages,
    },
    platformCampaign: {
      findUnique: findCampaign,
      create: createCampaign,
      delete: deleteCampaign,
    },
    platformAuditEvent: {
      create: createAuditEvent,
      createMany: createAuditEvents,
    },
  };
  const prisma = {
    platformCampaign: { findMany: findCampaigns, findUnique: findCampaign },
    $transaction: vi.fn((operation: unknown) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : (operation as (tx: typeof transaction) => unknown)(transaction),
    ),
  };
  return {
    requirePlatformSessionAdminMock: vi.fn(),
    findCampaignsMock: findCampaigns,
    findCampaignMock: findCampaign,
    createCampaignMock: createCampaign,
    findLeadsMock: findLeads,
    findCampaignEntriesMock: findCampaignEntries,
    findCampaignEntryMock: findCampaignEntry,
    deleteCampaignEntryMock: deleteCampaignEntry,
    findCampaignMessagesMock: findCampaignMessages,
    updateCampaignMessagesMock: updateCampaignMessages,
    deleteCampaignMock: deleteCampaign,
    createCampaignEntriesMock: createCampaignEntries,
    createAuditEventMock: createAuditEvent,
    createAuditEventsMock: createAuditEvents,
    prismaMock: prisma,
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

import {
  addPlatformLeadsToCampaign,
  cancelScheduledPlatformCampaignMessages,
  createPlatformCampaign,
  deletePlatformCampaign,
  listPlatformCampaigns,
  removePlatformLeadFromCampaign,
} from "@/lib/services/platform/platform-campaign-service";

describe("platform campaign management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-1" });
  });

  it("lists campaigns only after authenticating the platform admin", async () => {
    findCampaignsMock.mockResolvedValue([]);

    await expect(listPlatformCampaigns()).resolves.toEqual([]);
    expect(requirePlatformSessionAdminMock).toHaveBeenCalledOnce();
    expect(findCampaignsMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ campaign_date: "desc" }, { created_at: "desc" }],
    }));
  });

  it("disables campaign actions for delivered or in-flight sends in the report", async () => {
    findCampaignsMock.mockResolvedValue([
      {
        id: "campaign-1",
        name: "Autumn launch",
        campaign_date: new Date("2026-10-10T00:00:00.000Z"),
        created_at: new Date("2026-10-01T00:00:00.000Z"),
        _count: { leads: 4 },
        whatsappMessages: [
          { status: "SUBMITTED", recipients: [{ status: "DELIVERED" }] },
        ],
      },
      {
        id: "campaign-2",
        name: "Winter launch",
        campaign_date: new Date("2026-11-10T00:00:00.000Z"),
        created_at: new Date("2026-10-02T00:00:00.000Z"),
        _count: { leads: 2 },
        whatsappMessages: [
          { status: "PROCESSING", recipients: [{ status: "PENDING" }] },
        ],
      },
    ]);

    const campaigns = await listPlatformCampaigns();

    expect(campaigns).toEqual([
      expect.objectContaining({
        id: "campaign-1",
        can_cancel: false,
        can_delete: false,
        action_block_reason: "Campaign actions are unavailable after a message has been delivered.",
      }),
      expect.objectContaining({
        id: "campaign-2",
        can_cancel: false,
        can_delete: false,
        action_block_reason: "Campaign actions are unavailable while a message is processing or awaiting delivery status.",
      }),
    ]);
  });

  it("normalizes and atomically audits campaign creation", async () => {
    const campaign = {
      id: "campaign-1",
      name: "Autumn launch",
      campaign_date: new Date("2026-10-10T00:00:00.000Z"),
    };
    createCampaignMock.mockResolvedValue(campaign);
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(createPlatformCampaign({
      name: "  Autumn launch ",
      campaignDate: "2026-10-10",
    })).resolves.toBe(campaign);

    expect(createCampaignMock).toHaveBeenCalledWith({
      data: {
        name: "Autumn launch",
        campaign_date: new Date("2026-10-10T00:00:00.000Z"),
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform_admin_id: "admin-1",
        action: "PLATFORM_CAMPAIGN_CREATED",
        entity_type: "PlatformCampaign",
        entity_id: "campaign-1",
      }),
    });
  });

  it("rejects invalid campaign dates before creating records", async () => {
    await expect(createPlatformCampaign({
      name: "Campaign",
      campaignDate: "2026-02-30",
    })).rejects.toThrow("Enter a valid campaign date.");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("adds unassigned leads once and audits every inserted membership", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1" });
    findLeadsMock.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);
    findCampaignEntriesMock.mockResolvedValue([{ lead_id: "lead-1" }]);
    createCampaignEntriesMock.mockResolvedValue({ count: 1 });
    createAuditEventsMock.mockResolvedValue({ count: 1 });

    await expect(addPlatformLeadsToCampaign(
      "campaign-1",
      ["lead-1", "lead-2", "lead-2"],
    )).resolves.toEqual({ addedCount: 1, alreadyAddedCount: 1 });

    expect(createCampaignEntriesMock).toHaveBeenCalledWith({
      data: [{ campaign_id: "campaign-1", lead_id: "lead-2" }],
    });
    expect(createAuditEventsMock).toHaveBeenCalledWith({
      data: [{
        platform_admin_id: "admin-1",
        action: "PLATFORM_CAMPAIGN_LEAD_ADDED",
        entity_type: "PlatformCampaignLead",
        entity_id: "campaign-1",
        details: { campaignId: "campaign-1", leadId: "lead-2" },
      }],
    });
  });

  it("rejects unknown lead IDs without creating memberships", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1" });
    findLeadsMock.mockResolvedValue([{ id: "lead-1" }]);

    await expect(addPlatformLeadsToCampaign(
      "campaign-1",
      ["lead-1", "foreign-lead"],
    )).rejects.toThrow("One or more selected leads could not be found.");
    expect(createCampaignEntriesMock).not.toHaveBeenCalled();
    expect(createAuditEventsMock).not.toHaveBeenCalled();
  });

  it("removes only the campaign membership and audits the change", async () => {
    findCampaignEntryMock.mockResolvedValue({
      campaign_id: "campaign-1",
      lead_id: "lead-1",
    });
    deleteCampaignEntryMock.mockResolvedValue({
      campaign_id: "campaign-1",
      lead_id: "lead-1",
    });
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(removePlatformLeadFromCampaign("campaign-1", "lead-1"))
      .resolves.toEqual({ removed: true });

    expect(findCampaignEntryMock).toHaveBeenCalledWith({
      where: {
        campaign_id_lead_id: {
          campaign_id: "campaign-1",
          lead_id: "lead-1",
        },
      },
      select: { campaign_id: true, lead_id: true },
    });
    expect(deleteCampaignEntryMock).toHaveBeenCalledWith({
      where: {
        campaign_id_lead_id: {
          campaign_id: "campaign-1",
          lead_id: "lead-1",
        },
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLATFORM_CAMPAIGN_LEAD_REMOVED",
        entity_id: "campaign-1",
        details: { campaignId: "campaign-1", leadId: "lead-1" },
      }),
    });
  });

  it("rejects removal when the lead is not assigned to the campaign", async () => {
    findCampaignEntryMock.mockResolvedValue(null);

    await expect(removePlatformLeadFromCampaign("campaign-1", "lead-1"))
      .rejects.toThrow("Lead is not assigned to this campaign.");
    expect(deleteCampaignEntryMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("cancels scheduled messages and records an audit event", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1" });
    updateCampaignMessagesMock.mockResolvedValue({ count: 2 });
    findCampaignMessagesMock.mockResolvedValue([
      { status: "CANCELLED", recipients: [{ status: "PENDING" }] },
    ]);
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(cancelScheduledPlatformCampaignMessages("campaign-1"))
      .resolves.toEqual({ cancelledCount: 2 });

    expect(updateCampaignMessagesMock).toHaveBeenCalledWith({
      where: { campaign_id: "campaign-1", status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        failure_summary: "Cancelled by platform administrator.",
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLATFORM_CAMPAIGN_SCHEDULED_MESSAGES_CANCELLED",
        entity_id: "campaign-1",
        details: { campaignId: "campaign-1", cancelledMessageCount: 2 },
      }),
    });
  });

  it("does not cancel scheduled messages once any recipient has received one", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1" });
    updateCampaignMessagesMock.mockResolvedValue({ count: 1 });
    findCampaignMessagesMock.mockResolvedValue([
      { status: "CANCELLED", recipients: [{ status: "DELIVERED" }] },
    ]);

    await expect(cancelScheduledPlatformCampaignMessages("campaign-1"))
      .rejects.toThrow("Campaign actions are unavailable after a message has been delivered.");

    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("deletes campaigns without delivered or in-flight messages and audits deletion", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1", name: "Autumn launch" });
    updateCampaignMessagesMock.mockResolvedValue({ count: 1 });
    findCampaignMessagesMock.mockResolvedValue([
      { status: "CANCELLED", recipients: [{ status: "PENDING" }] },
    ]);
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });
    deleteCampaignMock.mockResolvedValue({ id: "campaign-1" });

    await expect(deletePlatformCampaign("campaign-1")).resolves.toEqual({ deleted: true });

    expect(createAuditEventMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLATFORM_CAMPAIGN_DELETED",
        entity_id: "campaign-1",
        details: { campaignId: "campaign-1", name: "Autumn launch" },
      }),
    });
    expect(deleteCampaignMock).toHaveBeenCalledWith({ where: { id: "campaign-1" } });
  });

  it("blocks campaign deletion while a message is delivered or in flight", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1", name: "Autumn launch" });
    updateCampaignMessagesMock.mockResolvedValue({ count: 0 });
    findCampaignMessagesMock.mockResolvedValue([
      { status: "SUBMITTED", recipients: [{ status: "DELIVERED" }] },
    ]);

    await expect(deletePlatformCampaign("campaign-1"))
      .rejects.toThrow("Campaign actions are unavailable after a message has been delivered.");

    expect(deleteCampaignMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("does not delete a campaign while delivery status is unresolved", async () => {
    findCampaignMock.mockResolvedValue({ id: "campaign-1", name: "Autumn launch" });
    updateCampaignMessagesMock.mockResolvedValue({ count: 0 });
    findCampaignMessagesMock.mockResolvedValue([
      { status: "UNKNOWN", recipients: [{ status: "PENDING" }] },
    ]);

    await expect(deletePlatformCampaign("campaign-1"))
      .rejects.toThrow("Campaign actions are unavailable while a message is processing or awaiting delivery status.");

    expect(deleteCampaignMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });
});
