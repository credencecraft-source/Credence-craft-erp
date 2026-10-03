import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    organization: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    supportTicket: { updateMany: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      organization: { findUnique: vi.fn() },
      auditEvent: { findMany: vi.fn() },
      platformAuditEvent: { findMany: vi.fn() },
      supportTicket: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    requirePlatformSessionAdmin: vi.fn(),
    getEffectivePlansForOrganization: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({ requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin }));
vi.mock("@/lib/services/platform/subscription-service", () => ({ getEffectivePlansForOrganization: mocks.getEffectivePlansForOrganization }));

import {
  extendOrganizationTrial,
  hasOrganizationTrialAccess,
  isOrganizationTrialActive,
  listOrganizationTrialHistory,
  removeOrganizationTrial,
  startOrganizationTrialOnApproval,
  startOrganizationTrialOnFirstOpen,
} from "./organization-trial-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
});

describe("organization trial lifecycle", () => {
  it("starts an approved trial for 24 hours plus configured extension and audits the admin", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T10:00:00.000Z"));
    mocks.transaction.organization.findUnique.mockResolvedValue({
      approval_status: "APPROVED",
      trial_started_at: null,
      trial_enabled: true,
      trial_extension_hours: 6,
    });

    mocks.transaction.organization.updateMany.mockResolvedValue({ count: 1 });
    await startOrganizationTrialOnApproval(mocks.transaction as never, "internal-org-id", "platform-admin-id");

    expect(mocks.transaction.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "internal-org-id", approval_status: "APPROVED", trial_started_at: null, trial_enabled: true },
      data: {
        trial_started_at: new Date("2026-10-02T10:00:00.000Z"),
        trial_ends_at: new Date("2026-10-03T16:00:00.000Z"),
      },
    });
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "platform-admin-id",
        action: "ORGANIZATION_TRIAL_STARTED",
        entity_id: "internal-org-id",
      }),
    }));
    vi.useRealTimers();
  });

  it("does not start a trial before approval and recognizes only an active trial window", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      approval_status: "PENDING_APPROVAL",
      trial_started_at: null,
      trial_enabled: true,
      trial_extension_hours: 0,
    });
    await startOrganizationTrialOnFirstOpen("internal-org-id", "workspace-user-id");
    expect(mocks.transaction.organization.updateMany).not.toHaveBeenCalled();

    mocks.prisma.organization.findUnique.mockResolvedValue({
      trial_started_at: new Date("2026-10-02T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
      trial_enabled: true,
    });
    await expect(isOrganizationTrialActive("internal-org-id", new Date("2026-10-02T11:00:00.000Z"))).resolves.toBe(true);
    await expect(isOrganizationTrialActive("internal-org-id", new Date("2026-10-03T10:00:00.000Z"))).resolves.toBe(false);
  });

  it("starts and audits the first-open trial within a bounded transaction timeout", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      approval_status: "APPROVED",
      trial_started_at: null,
      trial_enabled: true,
      trial_extension_hours: 0,
    });
    mocks.transaction.organization.updateMany.mockResolvedValue({ count: 1 });

    await startOrganizationTrialOnFirstOpen("internal-org-id", "workspace-user-id");

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10000,
      timeout: 20000,
    });
    expect(mocks.transaction.organization.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "internal-org-id", approval_status: "APPROVED", trial_started_at: null, trial_enabled: true },
    }));
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        user_id: "workspace-user-id",
        action: "ORGANIZATION_TRIAL_STARTED",
      }),
    }));
  });

  it("adds an extension to an active trial and audits the platform admin", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T10:00:00.000Z"));
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "internal-org-id",
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
      trial_enabled: true,
      trial_extension_hours: 0,
    });
    mocks.transaction.organization.update.mockResolvedValue({
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-04T10:00:00.000Z"),
      trial_enabled: true,
      trial_extension_hours: 0,
    });
    mocks.transaction.supportTicket.updateMany.mockResolvedValue({ count: 1 });

    await extendOrganizationTrial("internal-org-id", 24);

    expect(mocks.transaction.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "internal-org-id" },
      data: { trial_enabled: true, trial_ends_at: new Date("2026-10-04T10:00:00.000Z") },
    }));
    expect(mocks.transaction.supportTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-id",
        subject: "Trial extension request",
        status: { in: ["OPEN", "ACTIVE", "HOLD", "IN_PROGRESS"] },
      }),
      data: { status: "RESOLVED" },
    }));
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "platform-admin-id",
        action: "ORGANIZATION_TRIAL_EXTENDED",
        entity_id: "internal-org-id",
      }),
    }));
    vi.useRealTimers();
  });

  it("blocks an expired unpaid trial but allows a paid organization", async () => {
    mocks.prisma.organization.findUnique.mockResolvedValue({
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-02T10:00:00.000Z"),
      trial_enabled: true,
    });
    mocks.getEffectivePlansForOrganization.mockResolvedValue([{ plan: { id: "free" }, isFree: true }]);

    await expect(hasOrganizationTrialAccess("internal-org-id", new Date("2026-10-02T10:00:00.000Z"))).resolves.toBe(false);

    mocks.getEffectivePlansForOrganization.mockResolvedValue([{ plan: { id: "paid" }, isFree: false }]);
    await expect(hasOrganizationTrialAccess("internal-org-id", new Date("2026-10-02T10:00:00.000Z"))).resolves.toBe(true);
  });

  it("removes the trial and records the platform audit event", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "internal-org-id",
      trial_enabled: true,
      trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
    });
    mocks.transaction.organization.update.mockResolvedValue({
      id: "internal-org-id",
      trial_enabled: false,
      trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
    });

    await removeOrganizationTrial("internal-org-id");

    expect(mocks.transaction.organization.update).toHaveBeenCalledWith({
      where: { id: "internal-org-id" },
      data: { trial_enabled: false },
      select: { id: true, trial_enabled: true, trial_ends_at: true },
    });
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ORGANIZATION_TRIAL_REMOVED", entity_id: "internal-org-id" }),
    }));
  });

  it("returns a chronological history of creation, trial starts, expiry, requests, and extensions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00.000Z"));
    mocks.prisma.organization.findUnique.mockResolvedValue({
      id: "internal-org-id",
      created_at: new Date("2026-10-01T08:00:00.000Z"),
    });
    mocks.prisma.auditEvent.findMany.mockResolvedValue([{
      id: "workspace-trial-start",
      action: "ORGANIZATION_TRIAL_STARTED",
      details: {
        startedAt: "2026-10-01T09:00:00.000Z",
        trialEnd: "2026-10-02T09:00:00.000Z",
      },
      created_at: new Date("2026-10-01T09:00:00.000Z"),
      user: { full_name: "Workspace Owner", email: "owner@example.com" },
    }]);
    mocks.prisma.platformAuditEvent.findMany.mockResolvedValue([{
      id: "auto-extension",
      action: "ORGANIZATION_TRIAL_AUTO_EXTENDED",
      details: {
        requestNumber: 1,
        extensionHours: 24,
        previousTrialEnd: "2026-10-02T09:00:00.000Z",
        trialEnd: "2026-10-03T09:00:00.000Z",
      },
      created_at: new Date("2026-10-02T10:00:00.000Z"),
      platformAdmin: null,
    }]);
    mocks.prisma.supportTicket.findMany.mockResolvedValue([{
      id: "extension-request",
      ticket_number: "request-number",
      description: "Automatic trial extension 1 of 3 granted for 24 hours.",
      status: "RESOLVED",
      created_at: new Date("2026-10-02T10:00:00.000Z"),
      updated_at: new Date("2026-10-02T10:00:00.000Z"),
      submittedBy: { full_name: "Workspace Owner", email: "owner@example.com" },
    }]);

    const history = await listOrganizationTrialHistory("internal-org-id");

    expect(history.events.map((event) => event.title)).toEqual([
      "Organisation created",
      "Trial started on first organisation open",
      "Trial expired",
      "Automatic trial extension granted",
      "Automatic extension request recorded",
      "Trial expired",
    ]);
    expect(history.events[1]).toMatchObject({
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      actor: "Workspace Owner",
    });
    expect(history.events[2].occurredAt).toEqual(new Date("2026-10-02T09:00:00.000Z"));
    expect(history.events[4]).toMatchObject({
      actor: "Workspace Owner",
      status: "Automatically granted",
    });
    expect(mocks.prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "internal-org-id", entity_id: "internal-org-id" }),
    }));
    expect(mocks.prisma.platformAuditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entity_type: "Organization", entity_id: "internal-org-id" }),
    }));
    vi.useRealTimers();
  });
});