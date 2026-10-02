import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    supportTicket: { findFirst: vi.fn(), create: vi.fn() },
  },
  requireOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("./organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));

import { requestExpiredTrialExtension } from "./support-ticket-service";

const now = new Date("2026-10-02T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-id" });
  mocks.prisma.organization.findUnique.mockResolvedValue({
    approval_status: "APPROVED",
    trial_enabled: true,
    trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
    trial_ends_at: new Date("2026-10-02T09:00:00.000Z"),
  });
});

describe("expired trial extension requests", () => {
  it("creates a tenant-scoped support ticket after trial expiration", async () => {
    mocks.prisma.supportTicket.findFirst.mockResolvedValue(null);
    mocks.prisma.supportTicket.create.mockResolvedValue({ id: "ticket-id" });

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now)).resolves.toEqual({
      ticket: { id: "ticket-id" },
      alreadyRequested: false,
    });

    expect(mocks.prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        submitted_by_user_id: "workspace-user-id",
        request_type: "TICKET",
        subject: "Trial extension request",
      }),
    });
  });

  it("rejects requests before the trial expires", async () => {
    mocks.prisma.organization.findUnique.mockResolvedValue({
      approval_status: "APPROVED",
      trial_enabled: true,
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-02T11:00:00.000Z"),
    });

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now))
      .rejects.toThrow("A trial extension can only be requested after the trial expires.");
    expect(mocks.prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it("returns an existing open request instead of creating a duplicate", async () => {
    mocks.prisma.supportTicket.findFirst.mockResolvedValue({ id: "existing-ticket-id" });

    await expect(requestExpiredTrialExtension("public-org-id", "workspace-user-id", now)).resolves.toEqual({
      ticket: { id: "existing-ticket-id" },
      alreadyRequested: true,
    });
    expect(mocks.prisma.supportTicket.create).not.toHaveBeenCalled();
  });
});