import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPublishedOnlineStore: vi.fn(),
  findEnabledOnlineStoreLocation: vi.fn(),
  createPosGeneralStockSale: vi.fn(),
}));

vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  findPublishedOnlineStore: mocks.findPublishedOnlineStore,
}));
vi.mock("@/lib/services/pos/online-store-inventory-service", () => ({
  findEnabledOnlineStoreLocation: mocks.findEnabledOnlineStoreLocation,
}));
vi.mock("@/lib/services/pos/pos-general-stock-sale-service", () => ({
  createPosGeneralStockSale: mocks.createPosGeneralStockSale,
}));

import { POST } from "./route";

const storeKey = "a".repeat(43);
const store = { id: "internal-org-1", organization_name: "Public Boutique" };
const shippingAddress = {
  recipientName: "Customer Name",
  phone: "9876543210",
  addressLine1: "12 Market Road",
  addressLine2: null,
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
};

function createRequest(
  body: Record<string, unknown>,
  origin = "http://localhost",
) {
  return new Request(`http://localhost/api/public/stores/${storeKey}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe("public online-store checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPublishedOnlineStore.mockResolvedValue(store);
    mocks.findEnabledOnlineStoreLocation.mockResolvedValue({
      id: "location-1",
      entityId: "entity-1",
      name: "Main Store",
    });
    mocks.createPosGeneralStockSale.mockResolvedValue({ invoiceNo: "POS-1001" });
  });

  it("places an anonymous order through the tenant-scoped invoice service", async () => {
    const response = await POST(
      createRequest({
        locationId: "location-1",
        requestKey: "44a5f444-3547-46b9-9db5-cdb0f6bc88d2",
        shippingAddress,
        lines: [{ stockId: "sku-1", quantity: "1" }],
      }),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ invoice: { invoiceNo: "POS-1001" } });
    expect(mocks.findEnabledOnlineStoreLocation).toHaveBeenCalledWith("internal-org-1", "location-1");
    expect(mocks.createPosGeneralStockSale).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      entityId: "entity-1",
      onlineStoreLocationId: "location-1",
      actorId: null,
      salesChannel: "ONLINE_STORE",
      shippingAddress: { ...shippingAddress, countryCode: "IN" },
      lines: [{ stockId: "sku-1", stockType: "SKU", quantity: "1", rate: "0", gstRate: "0", discountPercent: "0" }],
    }));
  });

  it("rejects cross-origin checkout and invalid store locations before invoice creation", async () => {
    const crossOrigin = await POST(
      createRequest({
        locationId: "location-1",
        requestKey: "44a5f444-3547-46b9-9db5-cdb0f6bc88d2",
        shippingAddress,
        lines: [{ stockId: "sku-1", quantity: "1" }],
      }, "https://untrusted.example"),
      { params: Promise.resolve({ storeKey }) },
    );
    mocks.findEnabledOnlineStoreLocation.mockResolvedValue(null);
    const invalidLocation = await POST(
      createRequest({
        locationId: "foreign-location",
        requestKey: "44a5f444-3547-46b9-9db5-cdb0f6bc88d2",
        shippingAddress,
        lines: [{ stockId: "sku-1", quantity: "1" }],
      }),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(crossOrigin.status).toBe(403);
    expect(invalidLocation.status).toBe(400);
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("rejects a missing address and oversized item list", async () => {
    const missingAddress = await POST(
      createRequest({
        locationId: "location-1",
        requestKey: "44a5f444-3547-46b9-9db5-cdb0f6bc88d2",
        lines: [{ stockId: "sku-1", quantity: "1" }],
      }),
      { params: Promise.resolve({ storeKey }) },
    );
    const oversizedCart = await POST(
      createRequest({
        locationId: "location-1",
        requestKey: "44a5f444-3547-46b9-9db5-cdb0f6bc88d2",
        shippingAddress,
        lines: Array.from({ length: 31 }, (_, index) => ({ stockId: `sku-${index}`, quantity: "1" })),
      }),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(missingAddress.status).toBe(400);
    expect(oversizedCart.status).toBe(400);
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });
});
