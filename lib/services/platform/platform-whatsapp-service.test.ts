import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => {
  const createTemplate = vi.fn();
  const createAuditEvent = vi.fn();
  const findWhatsAppConfiguration = vi.fn();
  const findCampaignMessage = vi.fn();
  const updateCampaignMessage = vi.fn();
  const deleteCampaignMessage = vi.fn();
  const findRecipients = vi.fn();
  const updateRecipients = vi.fn();
  const createAuditEvents = vi.fn();
  const transaction = {
    platformWhatsAppTemplate: { create: createTemplate },
    platformWhatsAppCampaignMessage: {
      findFirst: findCampaignMessage,
      updateMany: updateCampaignMessage,
      delete: deleteCampaignMessage,
    },
    platformAuditEvent: { create: createAuditEvent },
  };
  return {
    requireAdmin: vi.fn(),
    createTemplate,
    createAuditEvent,
    findWhatsAppConfiguration,
    findCampaignMessage,
    updateCampaignMessage,
    deleteCampaignMessage,
    findRecipients,
    updateRecipients,
    createAuditEvents,
    transaction,
    prisma: {
      platformWhatsAppConfiguration: { findUnique: findWhatsAppConfiguration },
      platformWhatsAppCampaignMessage: {
        findFirst: findCampaignMessage,
        updateMany: updateCampaignMessage,
        delete: deleteCampaignMessage,
      },
      platformWhatsAppCampaignMessageRecipient: {
        findMany: findRecipients,
        updateMany: updateRecipients,
      },
      platformAuditEvent: { createMany: createAuditEvents },
      $transaction: vi.fn((operation: unknown) =>
        (operation as (tx: typeof transaction) => unknown)(transaction),
      ),
    },
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/auth/secret-cryptography", () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
  decryptSecret: (value: string) => value.replace("encrypted:", ""),
}));

import {
  applyPlatformWhatsAppDeliveryCallback,
  cancelPlatformWhatsAppCampaignMessage,
  deletePlatformWhatsAppCampaignMessage,
  savePlatformWhatsAppTemplate,
  schedulePlatformWhatsAppCampaignMessage,
} from "@/lib/services/platform/platform-whatsapp-service";

describe("platform WhatsApp campaign service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((operation: unknown) =>
      (operation as (tx: typeof mocks.transaction) => unknown)(mocks.transaction),
    );
    mocks.requireAdmin.mockResolvedValue({ id: "admin-1", team_role: "CMO" });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("rejects non-HTTPS template image URLs without writing a template", async () => {
    await expect(savePlatformWhatsAppTemplate({
      templateName: "launch_offer",
      sampleTemplateText: "Hello",
      integratedNumber: "+919876543210",
      imageUrl: "http://example.com/banner.png",
      languageCode: "en",
      isActive: true,
    })).rejects.toThrow("Image URL must be a valid HTTPS URL.");

    expect(mocks.createTemplate).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires opt-in confirmation before querying campaign records", async () => {
    await expect(schedulePlatformWhatsAppCampaignMessage({
      campaignId: "campaign-1",
      templateId: "template-1",
      scheduledAt: new Date(Date.now() + 60_000),
      consentConfirmed: false,
    })).rejects.toThrow("Confirm that campaign recipients have opted in");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("persists a normalized approved template and audit event together", async () => {
    const created = {
      id: "template-1",
      template_name: "launch_offer",
      language_code: "en",
      is_active: true,
    };
    mocks.createTemplate.mockResolvedValue(created);

    await expect(savePlatformWhatsAppTemplate({
      templateName: " launch_offer ",
      sampleTemplateText: "Hello customer",
      integratedNumber: "+91 98765-43210",
      imageUrl: "",
      languageCode: "en",
      isActive: true,
    })).resolves.toEqual(created);

    expect(mocks.createTemplate).toHaveBeenCalledWith({
      data: {
        template_name: "launch_offer",
        sample_template_text: "Hello customer",
        integrated_number: "+919876543210",
        image_url: null,
        language_code: "en",
        is_active: true,
      },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "admin-1",
        action: "PLATFORM_WHATSAPP_TEMPLATE_CREATED",
      }),
    }));
  });

  it("does not let a late sent callback regress a delivered or read recipient", async () => {
    const callbackToken = "test-callback-token";
    mocks.findWhatsAppConfiguration.mockResolvedValue({
      callback_token_hash: createHash("sha256").update(callbackToken).digest("hex"),
    });
    mocks.findRecipients.mockResolvedValue([
      { id: "recipient-1", campaign_message_id: "message-1" },
    ]);
    mocks.updateRecipients.mockResolvedValue({ count: 1 });
    mocks.createAuditEvents.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockResolvedValue([]);

    await expect(applyPlatformWhatsAppDeliveryCallback(callbackToken, {
      requestId: "msg91-request-1",
      mobile: "919876543210",
      status: "sent",
    })).resolves.toBe(true);

    expect(mocks.findRecipients).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ["SUBMITTED"] },
      }),
    }));
  });

  it("cancels only scheduled campaign messages and audits the action", async () => {
    mocks.findCampaignMessage.mockResolvedValue({
      id: "message-1",
      status: "SCHEDULED",
      recipients: [{ status: "PENDING" }],
    });
    mocks.updateCampaignMessage.mockResolvedValue({ count: 1 });

    await expect(cancelPlatformWhatsAppCampaignMessage("campaign-1", "message-1"))
      .resolves.toEqual({ cancelled: true });

    expect(mocks.findCampaignMessage).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "message-1", campaign_id: "campaign-1" },
    }));
    expect(mocks.updateCampaignMessage).toHaveBeenCalledWith({
      where: { id: "message-1", campaign_id: "campaign-1", status: "SCHEDULED" },
      data: {
        status: "CANCELLED",
        failure_summary: "Cancelled by platform administrator.",
      },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "PLATFORM_WHATSAPP_CAMPAIGN_MESSAGE_CANCELLED",
        entity_id: "message-1",
      }),
    }));
  });

  it("blocks cancellation after a recipient has received the message", async () => {
    mocks.findCampaignMessage.mockResolvedValue({
      id: "message-1",
      status: "SCHEDULED",
      recipients: [{ status: "DELIVERED" }],
    });

    await expect(cancelPlatformWhatsAppCampaignMessage("campaign-1", "message-1"))
      .rejects.toThrow("A WhatsApp schedule cannot be changed after a recipient has received the message.");

    expect(mocks.updateCampaignMessage).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes an unsent schedule and audits the removal", async () => {
    mocks.findCampaignMessage.mockResolvedValue({
      id: "message-1",
      status: "SCHEDULED",
      template_id: "template-1",
      recipients: [{ status: "PENDING" }],
    });
    mocks.updateCampaignMessage.mockResolvedValue({ count: 1 });
    mocks.deleteCampaignMessage.mockResolvedValue({ id: "message-1" });

    await expect(deletePlatformWhatsAppCampaignMessage("campaign-1", "message-1"))
      .resolves.toEqual({ deleted: true });

    expect(mocks.updateCampaignMessage).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "message-1", campaign_id: "campaign-1", status: "SCHEDULED" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "PLATFORM_WHATSAPP_CAMPAIGN_MESSAGE_DELETED",
        entity_id: "message-1",
      }),
    }));
    expect(mocks.deleteCampaignMessage).toHaveBeenCalledWith({ where: { id: "message-1" } });
  });

  it("blocks schedule deletion after delivery or while status is unresolved", async () => {
    mocks.findCampaignMessage.mockResolvedValue({
      id: "message-1",
      status: "SUBMITTED",
      template_id: "template-1",
      recipients: [{ status: "DELIVERED" }],
    });

    await expect(deletePlatformWhatsAppCampaignMessage("campaign-1", "message-1"))
      .rejects.toThrow("A WhatsApp schedule cannot be changed after a recipient has received the message.");

    expect(mocks.deleteCampaignMessage).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("does not delete a schedule if dispatch claimed it before the user action", async () => {
    mocks.findCampaignMessage.mockResolvedValue({
      id: "message-1",
      status: "SCHEDULED",
      template_id: "template-1",
      recipients: [{ status: "PENDING" }],
    });
    mocks.updateCampaignMessage.mockResolvedValue({ count: 0 });

    await expect(deletePlatformWhatsAppCampaignMessage("campaign-1", "message-1"))
      .rejects.toThrow("The WhatsApp schedule changed before it could be deleted.");

    expect(mocks.deleteCampaignMessage).not.toHaveBeenCalled();
  });
});
