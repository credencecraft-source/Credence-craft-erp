import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { listPlatformLeadActivityPageMock } = vi.hoisted(() => ({
  listPlatformLeadActivityPageMock: vi.fn(),
}));

vi.mock("@/lib/services/platform/platform-lead-service", () => ({
  listPlatformLeadActivityPage: listPlatformLeadActivityPageMock,
}));

describe("platform lead activity route", () => {
  let get: (request: Request) => Promise<Response>;

  beforeAll(async () => {
    ({ GET: get } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    listPlatformLeadActivityPageMock.mockResolvedValue({
      activity: [{ id: "event-1" }],
      nextCursor: null,
    });
  });

  it("returns an activity page with a continuation cursor", async () => {
    const response = await get(new Request("http://localhost/api/platform/leads/activity"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      activity: [{ id: "event-1" }],
      nextCursor: null,
    });
    expect(listPlatformLeadActivityPageMock).toHaveBeenCalledWith(undefined);
  });

  it("passes a validated cursor to the activity service", async () => {
    await get(new Request("http://localhost/api/platform/leads/activity?cursor=event-older"));

    expect(listPlatformLeadActivityPageMock).toHaveBeenCalledWith("event-older");
  });

  it("rejects an empty cursor", async () => {
    const response = await get(new Request("http://localhost/api/platform/leads/activity?cursor=%20"));

    expect(response.status).toBe(400);
    expect(listPlatformLeadActivityPageMock).not.toHaveBeenCalled();
  });
});
