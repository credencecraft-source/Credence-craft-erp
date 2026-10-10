import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
  transaction: {
    $queryRaw: vi.fn(),
    organization: { findUnique: vi.fn(), updateMany: vi.fn() },
    supportTicket: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
  requireOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("./organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));

import { requestExpiredTrialExtension } from "./support-ticket-service";

const now = new Date("2026-10-02T10:00:00.000Z");
const expiredOrganization = {
  approval_status: "APPROVED",
  trial_enabled: true,
  trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
  trial_ends_at: new Date("2026-10-02T09:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.transaction));
  mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-id" });
  mocks.transaction.organization.findUnique.mockResolvedValue(expiredOrganization);
  mocks.transaction.organization.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.supportTicket.findFirst.mockResolvedValue(null);
  mocks.transaction.supportTicket.count.mockResolvedValue(0);
  mocks.transaction.supportTicket.create.mockImplementation(({ data }) => ({ ...data, id: "ticket-id" }));
});

describe("expired trial extension requests", () => {
  it.each([0, 1, 2])("automatically grants the first three requests (request %i)", async (requestCount) => {
    mocks.transaction.supportTicket.count.mockResolvedValue(requestCount);

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now)).resolves.toMatchObject({
      ticket: {
        id: "ticket-id",
        organization_id: "internal-org-id",
        submitted_by_user_id: "workspace-user-id",
        status: "RESOLVED",
      },
      alreadyRequested: false,
      autoExtended: true,
      trialEndsAt: new Date("2026-10-03T10:00:00.000Z"),
    });

    expect(mocks.transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.transaction.supportTicket.count).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-id",
        subject: "Trial extension request",
        request_type: "TICKET",
        description: { startsWith: "Automatic trial extension " },
      },
    });
    expect(mocks.transaction.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "internal-org-id",
        trial_enabled: true,
        trial_ends_at: expiredOrganization.trial_ends_at,
      },
      data: { trial_ends_at: new Date("2026-10-03T10:00:00.000Z") },
    });
    expect(mocks.transaction.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        submitted_by_user_id: "workspace-user-id",
        request_type: "TICKET",
        subject: "Trial extension request",
        status: "RESOLVED",
      }),
    });
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledOnce();
  });

  it("creates a pending platform review request after three automatic extensions", async () => {
    mocks.transaction.supportTicket.count.mockResolvedValue(3);

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now)).resolves.toMatchObject({
      ticket: { id: "ticket-id" },
      alreadyRequested: false,
      autoExtended: false,
      trialEndsAt: null,
    });

    expect(mocks.transaction.organization.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        submitted_by_user_id: "workspace-user-id",
        subject: "Trial extension request",
        description: expect.stringContaining("Platform review requested"),
      }),
    });
    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects requests before the trial expires", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      ...expiredOrganization,
      trial_ends_at: new Date("2026-10-02T11:00:00.000Z"),
    });

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now))
      .rejects.toThrow("A trial extension can only be requested after the trial expires.");
    expect(mocks.transaction.supportTicket.create).not.toHaveBeenCalled();
  });

  it("returns an existing open request instead of creating a duplicate", async () => {
    mocks.transaction.supportTicket.findFirst.mockResolvedValue({ id: "existing-ticket-id" });

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now)).resolves.toEqual({
      ticket: { id: "existing-ticket-id" },
      alreadyRequested: true,
      autoExtended: false,
      trialEndsAt: null,
    });
    expect(mocks.transaction.supportTicket.count).not.toHaveBeenCalled();
    expect(mocks.transaction.supportTicket.create).not.toHaveBeenCalled();
  });
});
