import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    platformLead: { findUnique: vi.fn(), updateMany: vi.fn() },
    supportTicket: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    ticketMessage: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    platformAuditEvent: { create: vi.fn(), createMany: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      platformLead: { findUnique: vi.fn() },
      platformAuditEvent: { create: vi.fn() },
      supportTicket: {
        create: vi.fn(),
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
    requirePlatformNavigationPermission: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformNavigationPermission: mocks.requirePlatformNavigationPermission,
}));
vi.mock("./organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));

import {
  addPlatformTicketMessage,
  addWorkspaceTicketMessage,
  createPlatformLeadSupportTicket,
  createPlatformSupportTicket,
  getSupportTicketForOrganization,
  getSupportTicketForUser,
  listSupportTickets,
  listSupportTicketsForUser,
  updateSupportTicketStatus,
} from "./support-ticket-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((operation) =>
    Array.isArray(operation) ? Promise.all(operation) : operation(mocks.transaction),
  );
  mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-id" });
  mocks.requirePlatformNavigationPermission.mockResolvedValue({ id: "admin-id" });
  mocks.transaction.supportTicket.create.mockResolvedValue({ id: "ticket-id" });
  mocks.transaction.ticketMessage.create.mockResolvedValue({ id: "message-id" });
  mocks.transaction.supportTicket.update.mockResolvedValue({ id: "ticket-id", status: "CLOSED" });
  mocks.prisma.supportTicket.findFirst.mockResolvedValue({ id: "ticket-id" });
  mocks.prisma.supportTicket.findUnique.mockResolvedValue({ id: "ticket-id", organization_id: "internal-org-id" });
  mocks.prisma.organization.findFirst.mockResolvedValue({ id: "internal-org-id" });
  mocks.transaction.platformLead.findUnique.mockResolvedValue({ id: "lead-id", name: "Taylor Reed" });
  mocks.transaction.platformLead.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.platformLead.findUnique.mockResolvedValue({ id: "lead-id", name: "Taylor Reed" });
  mocks.prisma.supportTicket.create.mockResolvedValue({ id: "ticket-id" });
  mocks.prisma.platformAuditEvent.create.mockResolvedValue({ id: "audit-id" });
});

describe("support ticket access and internal notes", () => {
  it("loads only report fields for the platform ticket list", async () => {
    await listSupportTickets();

    expect(mocks.prisma.supportTicket.findMany).toHaveBeenCalledWith({
      select: expect.not.objectContaining({ description: true }),
      orderBy: { created_at: "desc" },
    });
  });

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

    await addPlatformTicketMessage("ticket-id", "  Internal investigation  ", true);

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

  it("creates an audited callback support ticket linked to a platform lead", async () => {
    await createPlatformLeadSupportTicket({
      leadId: "lead-id",
      subject: "Callback for Taylor Reed",
      description: "Discuss the product demonstration and answer the lead's questions.",
      requestType: "CALLBACK",
      callbackDate: "2026-10-06",
      callbackTime: "14:30",
    });

    expect(mocks.requirePlatformNavigationPermission).toHaveBeenCalledWith("canAccessLeadsAndSubscriptions");
    expect(mocks.prisma.platformLead.findUnique).toHaveBeenCalledWith({
      where: { id: "lead-id" },
      select: { id: true },
    });
    expect(mocks.prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: null,
        submitted_by_user_id: null,
        platform_lead_id: "lead-id",
        created_by_platform_admin_id: "admin-id",
        request_type: "CALLBACK",
        callback_date: "2026-10-06",
        callback_time: "14:30",
      }),
    });
    expect(mocks.prisma.platformAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PLATFORM_LEAD_SUPPORT_TICKET_CREATED",
        entity_type: "SupportTicket",
        details: expect.objectContaining({ requestType: "CALLBACK" }),
      }),
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
  });

  it("requires a valid callback date and time before creating a lead callback", async () => {
    await expect(createPlatformLeadSupportTicket({
      leadId: "lead-id",
      subject: "Callback for Taylor Reed",
      description: "Discuss the product demonstration and answer the lead's questions.",
      requestType: "CALLBACK",
      callbackDate: "",
      callbackTime: "",
    })).rejects.toThrow("Callback date and time are required.");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("schedules a lead callback and moves the lead to Call Back Later atomically", async () => {
    mocks.transaction.platformLead.findUnique.mockResolvedValue({
      id: "lead-id",
      stage: "Need To Call",
    });
    mocks.transaction.supportTicket.create.mockResolvedValue({ id: "callback-ticket-id" });

    await createPlatformLeadSupportTicket({
      leadId: "lead-id",
      subject: "Callback for Taylor Reed",
      description: "Call back later at the scheduled date and time.",
      requestType: "CALLBACK",
      callbackDate: "2026-10-14",
      callbackTime: "10:30",
      markCallBackLater: true,
    });

    expect(mocks.transaction.platformLead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead-id", stage: "Need To Call" },
      data: { stage: "Call Back Later" },
    });
    expect(mocks.transaction.supportTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_lead_id: "lead-id",
        request_type: "CALLBACK",
        callback_date: "2026-10-14",
        callback_time: "10:30",
      }),
    }));
    expect(mocks.transaction.platformAuditEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: "PLATFORM_LEAD_SUPPORT_TICKET_CREATED",
          entity_id: "callback-ticket-id",
        }),
        expect.objectContaining({
          action: "PLATFORM_LEAD_STAGE_UPDATED",
          entity_id: "lead-id",
          details: { previousStage: "Need To Call", stage: "Call Back Later" },
        }),
      ]),
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("does not schedule callbacks for leads outside the Need To Call group", async () => {
    mocks.transaction.platformLead.findUnique.mockResolvedValue({
      id: "lead-id",
      stage: "Interested For Demo",
    });

    await expect(createPlatformLeadSupportTicket({
      leadId: "lead-id",
      subject: "Callback for Taylor Reed",
      description: "Call back later at the scheduled date and time.",
      requestType: "CALLBACK",
      callbackDate: "2026-10-14",
      callbackTime: "10:30",
      markCallBackLater: true,
    })).rejects.toThrow("Only leads under Need To Call can schedule a callback.");
    expect(mocks.transaction.supportTicket.create).not.toHaveBeenCalled();
    expect(mocks.transaction.platformLead.updateMany).not.toHaveBeenCalled();
  });

  it("records status changes in the platform audit trail", async () => {
    mocks.transaction.supportTicket.findUnique.mockResolvedValue({ id: "ticket-id", status: "OPEN" });
    mocks.transaction.supportTicket.update.mockResolvedValue({ id: "ticket-id", status: "CLOSED" });

    await updateSupportTicketStatus("ticket-id", "CLOSED");

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
