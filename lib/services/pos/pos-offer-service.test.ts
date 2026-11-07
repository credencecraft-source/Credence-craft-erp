import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PosOfferScope, PosOfferStatus, PosOfferType } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: {
    masterCategory: { findMany: vi.fn() },
    masterColor: { findMany: vi.fn() },
    masterSize: { findMany: vi.fn() },
    posOffer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    posOfferTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
  prisma: {
    masterEntity: { findFirst: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn() },
    finishedGoodsSkuStock: { findMany: vi.fn() },
    posOffer: { findFirst: vi.fn(), findMany: vi.fn() },
    masterCategory: { findMany: vi.fn() },
    masterColor: { findMany: vi.fn() },
    masterSize: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  createPosOffer,
  getPosOffer,
  listEligiblePosOffersByStock,
  listPosOffers,
  PosOfferValidationError,
  updatePosOffer,
} from "./pos-offer-service";

const input = {
  organizationId: "organization-internal-1",
  actorId: "user-1",
  requestKey: "offer-request-1",
  offerCode: "SAVE10",
  name: "Ten Percent Off",
  offerType: PosOfferType.PERCENTAGE,
  scope: PosOfferScope.ALL,
  status: PosOfferStatus.DRAFT,
  discountPercentage: "10",
  startsAt: "2026-11-06",
  targetIds: [],
};

function savedOffer() {
  return {
    id: "offer-1",
    organization_id: input.organizationId,
    request_key: input.requestKey,
    offer_code: "SAVE10",
    name: "TEN PERCENT OFF",
    description: null,
    offer_type: PosOfferType.PERCENTAGE,
    scope: PosOfferScope.ALL,
    status: PosOfferStatus.DRAFT,
    discount_amount: null,
    discount_percentage: new Prisma.Decimal("10"),
    buy_quantity: null,
    get_quantity: null,
    get_discount_percentage: null,
    combo_price: null,
    starts_at: new Date("2026-11-06T00:00:00.000Z"),
    ends_at: null,
    created_by: "user-1",
    created_at: new Date("2026-11-06T10:00:00.000Z"),
    updated_at: new Date("2026-11-06T10:00:00.000Z"),
    targets: [],
  };
}

describe("POS offer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.posOffer.findFirst.mockImplementation(async ({ where }) =>
      where.id ? savedOffer() : null);
    mocks.transaction.posOffer.create.mockResolvedValue({ id: "offer-1" });
    mocks.transaction.posOffer.update.mockResolvedValue({});
    mocks.transaction.posOfferTarget.createMany.mockResolvedValue({ count: 0 });
    mocks.transaction.posOfferTarget.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.posOffer.findFirst.mockResolvedValue(null);
    mocks.prisma.posOffer.findMany.mockResolvedValue([]);
    mocks.prisma.masterEntity.findFirst.mockResolvedValue({ id: "entity-1" });
    mocks.prisma.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsSkuStock.findMany.mockResolvedValue([]);
    mocks.transaction.masterCategory.findMany.mockResolvedValue([]);
    mocks.transaction.masterColor.findMany.mockResolvedValue([]);
    mocks.transaction.masterSize.findMany.mockResolvedValue([]);
    mocks.prisma.masterCategory.findMany.mockResolvedValue([]);
    mocks.prisma.masterColor.findMany.mockResolvedValue([]);
    mocks.prisma.masterSize.findMany.mockResolvedValue([]);
  });

  it("creates an organization-scoped offer and audits it in the same transaction", async () => {
    const result = await createPosOffer(input);

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
    expect(mocks.transaction.posOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: input.organizationId,
        offer_code: "SAVE10",
        name: "TEN PERCENT OFF",
        offer_type: PosOfferType.PERCENTAGE,
        scope: PosOfferScope.ALL,
        discount_percentage: new Prisma.Decimal("10"),
      }),
    }));
    expect(mocks.transaction.posOfferTarget.createMany).not.toHaveBeenCalled();
    expect(mocks.transaction.posOffer.findFirst).toHaveBeenLastCalledWith({
      where: { organization_id: input.organizationId, id: "offer-1" },
      include: expect.any(Object),
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: input.organizationId,
      action: "CREATE_POS_OFFER",
      entityId: "offer-1",
    }), mocks.transaction);
    expect(result).toMatchObject({
      id: "offer-1",
      offerCode: "SAVE10",
      discountPercentage: "10.00",
      targetLabels: [],
    });
  });

  it("rejects out-of-range percentage values before opening a transaction", async () => {
    await expect(createPosOffer({
      ...input,
      discountPercentage: "100.01",
    })).rejects.toBeInstanceOf(PosOfferValidationError);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects targets that are not active in the authorized organization", async () => {
    await expect(createPosOffer({
      ...input,
      scope: PosOfferScope.CATEGORY,
      targetIds: ["category-from-another-org"],
    })).rejects.toThrow("inactive or do not belong to this organization");
    expect(mocks.transaction.masterCategory.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: input.organizationId,
        id: { in: ["category-from-another-org"] },
        is_active: true,
      },
      select: { id: true },
    });
    expect(mocks.transaction.posOffer.create).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("writes validated scoped targets with createMany in the same transaction", async () => {
    mocks.transaction.masterCategory.findMany.mockResolvedValue([{ id: "category-1" }]);
    mocks.transaction.posOffer.findFirst.mockImplementation(async ({ where }) =>
      where.id ? {
        ...savedOffer(),
        scope: PosOfferScope.CATEGORY,
        targets: [{
          category: { category_name: "DRESSES" },
          color: null,
          size: null,
        }],
      } : null);

    await createPosOffer({
      ...input,
      scope: PosOfferScope.CATEGORY,
      targetIds: ["category-1"],
    });

    expect(mocks.transaction.posOfferTarget.createMany).toHaveBeenCalledWith({
      data: [{
        organization_id: input.organizationId,
        category_id: "category-1",
        color_id: null,
        size_id: null,
        offer_id: "offer-1",
      }],
    });
  });

  it("keeps report search and cursor predicates together with tenant and type filters", async () => {
    const createdAt = new Date("2026-11-06T10:00:00.000Z");
    await listPosOffers({
      organizationId: input.organizationId,
      offerType: PosOfferType.PERCENTAGE,
      scope: PosOfferScope.ALL,
      status: PosOfferStatus.ACTIVE,
      search: "save",
      cursor: { id: "cursor-1", createdAt },
      limit: 50,
    });

    expect(mocks.prisma.posOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: input.organizationId,
        offer_type: PosOfferType.PERCENTAGE,
        scope: PosOfferScope.ALL,
        status: PosOfferStatus.ACTIVE,
        AND: [
          { OR: expect.arrayContaining([
            { offer_code: { contains: "SAVE", mode: "insensitive" } },
            { name: { contains: "SAVE", mode: "insensitive" } },
          ]) },
          { OR: expect.arrayContaining([
            { created_at: { lt: createdAt } },
            { created_at: createdAt, id: { lt: "cursor-1" } },
          ]) },
        ],
      }),
      take: 51,
    }));
  });

  it("returns active offers that match each tenant-scoped stock record", async () => {
    mocks.prisma.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      id: "sku-1",
      product_category: "Dresses",
      sub_product_category: "Party Wear",
      colour: "Navy",
      size: "M",
    }] as never);
    mocks.prisma.posOffer.findMany.mockResolvedValue([{
      ...savedOffer(),
      status: PosOfferStatus.ACTIVE,
      targets: [{
        id: "target-1",
        category: { category_name: "DRESSES" },
        color: null,
        size: null,
      }],
    }] as never);

    const result = await listEligiblePosOffersByStock({
      organizationId: input.organizationId,
      entityId: "entity-1",
      invoiceDate: "2026-11-06",
      stockKeys: ["SKU:sku-1"],
    });

    expect(mocks.prisma.masterEntity.findFirst).toHaveBeenCalledWith({
      where: {
        id: "entity-1",
        organization_id: input.organizationId,
        is_active: true,
      },
      select: { id: true },
    });
    expect(mocks.prisma.finishedGoodsSkuStock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: input.organizationId,
        entity_id: "entity-1",
        id: { in: ["sku-1"] },
      }),
    }));
    expect(mocks.prisma.posOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: input.organizationId,
        status: PosOfferStatus.ACTIVE,
        starts_at: { lte: new Date("2026-11-06T00:00:00.000Z") },
      }),
      take: 101,
    }));
    expect(result.offersByStock["SKU:sku-1"]).toMatchObject([
      { id: "offer-1", offerCode: "SAVE10", offerType: PosOfferType.PERCENTAGE },
    ]);
  });

  it("rejects stock outside the requested Entity before querying offers", async () => {
    await expect(listEligiblePosOffersByStock({
      organizationId: input.organizationId,
      entityId: "entity-1",
      invoiceDate: "2026-11-06",
      stockKeys: ["GENERAL_GRN:stock-from-another-entity"],
    })).rejects.toThrow("not General stock in this organization and Entity");
    expect(mocks.prisma.posOffer.findMany).not.toHaveBeenCalled();
  });

  it("lists all offer types and scopes with an organization-only filter", async () => {
    await listPosOffers({
      organizationId: input.organizationId,
      limit: 50,
    });

    expect(mocks.prisma.posOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: input.organizationId },
      take: 51,
    }));
  });

  it("loads an offer using both the authorized organization and record ID", async () => {
    mocks.prisma.posOffer.findFirst.mockResolvedValue(savedOffer());

    const result = await getPosOffer(input.organizationId, "offer-1");

    expect(mocks.prisma.posOffer.findFirst).toHaveBeenCalledWith({
      where: { organization_id: input.organizationId, id: "offer-1" },
      include: expect.any(Object),
    });
    expect(result).toMatchObject({ id: "offer-1", targetIds: [] });
  });

  it("updates an organization-scoped offer and audits the change transactionally", async () => {
    let reload = false;
    mocks.transaction.posOffer.findFirst.mockImplementation(async ({ where }) => {
      if (!where.id) return null;
      if (!reload) {
        reload = true;
        return savedOffer();
      }
      return {
        ...savedOffer(),
        offer_code: "SAVE12",
        discount_percentage: new Prisma.Decimal("12"),
      };
    });

    const result = await updatePosOffer({
      ...input,
      offerId: "offer-1",
      offerCode: "SAVE12",
      discountPercentage: "12",
    });

    expect(mocks.transaction.posOffer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id_id: {
          organization_id: input.organizationId,
          id: "offer-1",
        },
      },
      data: expect.objectContaining({
        offer_code: "SAVE12",
        discount_percentage: new Prisma.Decimal("12"),
      }),
    }));
    expect(mocks.transaction.posOfferTarget.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: input.organizationId, offer_id: "offer-1" },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "UPDATE_POS_OFFER",
      entityId: "offer-1",
    }), mocks.transaction);
    expect(result.offerCode).toBe("SAVE12");
  });
});
