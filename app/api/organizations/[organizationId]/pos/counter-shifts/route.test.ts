import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listPosCounterShifts: vi.fn(),
  getPosCounterShiftReadinessMessage: vi.fn(),
  openPosCounterShift: vi.fn(),
  closePosCounterShift: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-counter-shift-service", () => ({
  getPosCounterShiftReadinessMessage: mocks.getPosCounterShiftReadinessMessage,
  listPosCounterShifts: mocks.listPosCounterShifts,
  openPosCounterShift: mocks.openPosCounterShift,
  closePosCounterShift: mocks.closePosCounterShift,
  PosCounterShiftConflictError: class PosCounterShiftConflictError extends Error {},
  PosCounterShiftNotFoundError: class PosCounterShiftNotFoundError extends Error {},
  PosCounterShiftValidationError: class PosCounterShiftValidationError extends Error {},
}));

import { GET, PATCH, POST } from "./route";

describe("POS counter-shift route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
      full_name: "Ravi Kumar",
    });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getPosCounterShiftReadinessMessage.mockReturnValue(null);
    mocks.listPosCounterShifts.mockResolvedValue({
      counterId: "counter-1",
      shifts: [],
      nextCursor: null,
      activeCounterShift: null,
      activeSalespersonShift: null,
      suggestedOpeningBalance: "0.00",
    });
    mocks.openPosCounterShift.mockResolvedValue({ id: "shift-1" });
    mocks.closePosCounterShift.mockResolvedValue({ id: "shift-1" });
  });

  it("lists shifts for the authorized tenant and authenticated salesperson", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts?counterId=counter-1&limit=25"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_COUNTERS",
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_SALES",
    );
    expect(mocks.listPosCounterShifts).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      cursor: null,
      limit: 25,
    });
  });

  it("opens a shift with the authorized tenant and session identity", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId: "counter-1", openingBalance: "5000.00" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "CREATE_POS_SALES",
    );
    expect(mocks.openPosCounterShift).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      actorName: "Ravi Kumar",
      openingBalance: "5000.00",
    });
  });

  it("closes a shift for the session actor", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: "shift-1", closingBalance: "55000.00" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.closePosCounterShift).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      shiftId: "shift-1",
      actorId: "user-1",
      closingBalance: "55000.00",
    });
  });

  it("rejects unauthenticated shift reads before organization lookup", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts?counterId=counter-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listPosCounterShifts).not.toHaveBeenCalled();
  });

  it("does not mutate shifts when create permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: missing permission."));

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId: "counter-1", openingBalance: "5000" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.openPosCounterShift).not.toHaveBeenCalled();
  });

  it("rejects malformed counter IDs before calling the shift service", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId: { id: "counter-1" }, openingBalance: "5000" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.openPosCounterShift).not.toHaveBeenCalled();
  });

  it("returns service readiness failures as 503 instead of masking them as server errors", async () => {
    mocks.listPosCounterShifts.mockRejectedValue(new Error("Prisma schema is not ready."));
    mocks.getPosCounterShiftReadinessMessage.mockReturnValue("Counter-shift schema is not ready.");

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter-shifts?counterId=counter-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Counter-shift schema is not ready." });
  });
});
