import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  findPublishedOnlineStoreByHostname: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  findPublishedOnlineStoreByHostname: mocks.findPublishedOnlineStoreByHostname,
  getOrganizationOnlineStorePresentation: vi.fn(),
}));
vi.mock("./login-page", () => ({
  default: function LoginPageMock() {
    return null;
  },
}));

import HomePage from "./page";

describe("home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the sign-in page directly in development without waiting for request headers", () => {
    vi.stubEnv("NODE_ENV", "development");

    const page = HomePage();

    expect(page).toHaveProperty("type");
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.findPublishedOnlineStoreByHostname).not.toHaveBeenCalled();
  });
});
