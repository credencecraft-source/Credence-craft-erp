import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    supportTicket: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    ticketMessage: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      supportTicket: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      ticketMessage: { create: vi.fn() },
      organization: { findFirst: vi.fn(), count: vi.fn() },
      subscription: { count: vi.fn() },
    },
    requireOrganizationAccess: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("./organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));

import {
  addPlatformTicketMessage,
  addWorkspaceTicketMessage,
  createPlatformSupportTicket,
  getSupportTicketForOrganization,
  getSupportTicketForUser,
  listSupportTicketsForUser,
  updateSupportTicketStatus,
} from "./support-ticket-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.transaction));
  mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-id" });
  mocks.transaction.supportTicket.create.mockResolvedValue({ id: "ticket-id" });
  mocks.transaction.ticketMessage.create.mockResolvedValue({ id: "message-id" });
  mocks.transaction.supportTicket.update.mockResolvedValue({ id: "ticket-id", status: "CLOSED" });
  mocks.prisma.supportTicket.findFirst.mockResolvedValue({ id: "ticket-id" });
  mocks.prisma.supportTicket.findUnique.mockResolvedValue({ id: "ticket-id", organization_id: "internal-org-id" });
  mocks.prisma.organization.findFirst.mockResolvedValue({ id: "internal-org-id" });
});

describe("support ticket access and internal notes", () => {
  it("scopes organization ticket details to the authorized internal organization and omits private notes", async () => {
    await getSupportTicketForOrganization("public-org-id", "ticket-id", "member-id");

    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith("member-id", "public-org-id");
    expect(mocks.prisma.supportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-id", organization_id: "internal-org-id" },
      include: expect.objectContaining({
        messages: expect.objectContaining({ where: { sender_type: { not: "INTERNAL" } } }),
      }),
    }));
  });

  it("lists workspace tickets only from organizations where the user is an active member", async () => {
    await listSupportTicketsForUser("member-id");

    expect(mocks.prisma.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization: {
          is_active: true,
          memberships: { some: { workspace_user_id: "member-id", is_active: true } },
        },
      },
    }));
  });

  it("scopes workspace ticket detail to active organization membership and hides private notes", async () => {
    await getSupportTicketForUser("ticket-id", "member-id");

    expect(mocks.prisma.supportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "ticket-id",
        organization: {
          is_active: true,
          memberships: { some: { workspace_user_id: "member-id", is_active: true } },
        },
      },
      include: expect.objectContaining({
        messages: expect.objectContaining({ where: { sender_type: { not: "INTERNAL" } } }),
      }),
    }));
  });

  it("permits active organization members to reply while scoping the ticket to their organization", async () => {
    mocks.transaction.ticketMessage.create.mockResolvedValue({ id: "message-id" });

    await addWorkspaceTicketMessage("public-org-id", "ticket-id", "member-id", "  Please help.  ");

    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith("member-id", "public-org-id");
    expect(mocks.prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: { id: "ticket-id", organization_id: "internal-org-id" },
    });
    expect(mocks.transaction.ticketMessage.create).toHaveBeenCalledWith({
      data: { support_ticket_id: "ticket-id", body: "Please help.", sender_type: "CUSTOMER", workspace_user_id: "member-id" },
    });
  });

  it("stores platform notes with a non-customer-visible sender type", async () => {
    mocks.transaction.ticketMessage.create.mockResolvedValue({ id: "note-id" });

    await addPlatformTicketMessage("ticket-id", "admin-id", "  Internal investigation  ", true);

    expect(mocks.transaction.ticketMessage.create).toHaveBeenCalledWith({
      data: { support_ticket_id: "ticket-id", body: "Internal investigation", sender_type: "INTERNAL", platform_admin_id: "admin-id" },
    });
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "SUPPORT_TICKET_PRIVATE_NOTE_ADDED", entity_id: "ticket-id" }),
    }));
    expect(mocks.transaction.supportTicket.update).toHaveBeenCalledWith({
      where: { id: "ticket-id" },
      data: { updated_at: expect.any(Date) },
    });
  });

  it("requires an active organization contact when platform admins create tickets", async () => {
    mocks.prisma.organization.findFirst.mockResolvedValue(null);

    await expect(createPlatformSupportTicket({
      organizationId: "public-org-id",
      submittedByUserId: "member-id",
      platformAdminId: "admin-id",
      subject: "Demo meeting",
      description: "Please coordinate a product demonstration with the organization.",
      requestType: "TICKET",
    })).rejects.toThrow("Select an active organization contact.");

    expect(mocks.prisma.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "public-org-id",
        memberships: { some: { workspace_user_id: "member-id", is_active: true } },
      }),
    }));
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates platform-assigned tickets for a verified active organization contact", async () => {
    await createPlatformSupportTicket({
      organizationId: "public-org-id",
      submittedByUserId: "member-id",
      platformAdminId: "admin-id",
      subject: "Demo meeting",
      description: "Please coordinate a product demonstration with the organization.",
    });

    expect(mocks.transaction.supportTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        submitted_by_user_id: "member-id",
        created_by_platform_admin_id: "admin-id",
        subject: "Demo meeting",
      }),
    }));
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "SUPPORT_TICKET_CREATED_FOR_ORGANIZATION" }),
    }));
  });

  it("records status changes in the platform audit trail", async () => {
    mocks.transaction.supportTicket.findUnique.mockResolvedValue({ id: "ticket-id", status: "OPEN" });
    mocks.transaction.supportTicket.update.mockResolvedValue({ id: "ticket-id", status: "CLOSED" });

    await updateSupportTicketStatus("ticket-id", "CLOSED", "admin-id");

    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "admin-id",
        action: "SUPPORT_TICKET_STATUS_UPDATED",
        entity_type: "SupportTicket",
        entity_id: "ticket-id",
        details: { previousStatus: "OPEN", status: "CLOSED" },
      },
    });
  });
});
