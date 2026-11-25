import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  findPublishedOnlineStoreByHostname: vi.fn(),
  homeLandingPage: vi.fn(),
}));

vi.mock("./_page-content/home-landing-page", () => ({
  default: mocks.homeLandingPage,
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

  it("renders the marketing homepage directly in development without waiting for request headers", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const page = await HomePage();

    expect(page).toHaveProperty("type");
    expect(page.type).toBe(mocks.homeLandingPage);
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.findPublishedOnlineStoreByHostname).not.toHaveBeenCalled();
  });

  it("renders the marketing homepage on canonical hosts without querying storefronts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.headers.mockResolvedValue(new Headers({ host: "www.credencecraft.in" }));

    const page = await HomePage();

    expect(page.type).toBe(mocks.homeLandingPage);
    expect(mocks.findPublishedOnlineStoreByHostname).not.toHaveBeenCalled();
  });

  it("checks custom storefront hosts before falling back to the marketing homepage", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.headers.mockResolvedValue(new Headers({ host: "shop.example.com" }));
    mocks.findPublishedOnlineStoreByHostname.mockResolvedValue(null);

    const page = await HomePage();

    expect(page.type).toBe(mocks.homeLandingPage);
    expect(mocks.findPublishedOnlineStoreByHostname).toHaveBeenCalledWith("shop.example.com");
  });
});
