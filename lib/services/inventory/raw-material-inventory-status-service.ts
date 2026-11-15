import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";

const AGE_BUCKETS = [
  { key: "days0To30", label: "0–30 days", maxDays: 30 },
  { key: "days31To60", label: "31–60 days", maxDays: 60 },
  { key: "days61To90", label: "61–90 days", maxDays: 90 },
  { key: "daysOver90", label: "Over 90 days", maxDays: Number.POSITIVE_INFINITY },
] as const;

export type RawMaterialInventoryStatusRow = {
  id: string;
  category: string;
  totalValue: number;
  unpricedQuantity: number;
  days0To30Value: number;
  days31To60Value: number;
  days61To90Value: number;
  daysOver90Value: number;
};

function quantity(value: Prisma.Decimal | number | string | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function ageBucket(days: number): typeof AGE_BUCKETS[number]["key"] {
  return AGE_BUCKETS.find(({ maxDays }) => days <= maxDays)?.key ?? "daysOver90";
}

export async function listRawMaterialInventoryStatus(
  workspaceUserId: string,
  publicOrganizationId: string,
  asOf = new Date(),
) {
  const membership = await requireOrganizationAccess(workspaceUserId, publicOrganizationId);
  const organizationId = membership.organization_id;

  const stocks = await prisma.rawMaterialStock.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      raw_material: true,
      quantity_on_hand: true,
      created_at: true,
      receiptLine: {
        select: {
          receipt: { select: { organization_id: true, received_date: true } },
          purchaseOrderLine: {
            select: {
              category: true,
              price: true,
              purchaseOrder: { select: { organization_id: true } },
            },
          },
        },
      },
    },
    orderBy: [{ raw_material: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });

  if (stocks.length === 0) return [];

  const rawMaterialNames = [...new Set(stocks.map(({ raw_material }) => raw_material))];
  const rawMaterialMasters = await prisma.masterRawMaterial.findMany({
    where: {
      organization_id: organizationId,
      raw_material_name: { in: rawMaterialNames },
    },
    select: {
      raw_material_name: true,
      raw_material_category: { select: { raw_material_category: true } },
      open_stock_price: true,
    },
  });
  const masterByName = new Map(
    rawMaterialMasters.map((master) => [master.raw_material_name.toLocaleLowerCase(), master]),
  );

  type MutableCategory = {
    id: string;
    category: string;
    totalValue: Prisma.Decimal;
    unpricedQuantity: Prisma.Decimal;
    days0To30Value: Prisma.Decimal;
    days31To60Value: Prisma.Decimal;
    days61To90Value: Prisma.Decimal;
    daysOver90Value: Prisma.Decimal;
  };
  const rows = new Map<string, MutableCategory>();
  for (const stock of stocks) {
    const onHand = quantity(stock.quantity_on_hand);
    if (onHand.lte(0)) continue;

    const receiptLine = stock.receiptLine?.receipt.organization_id === organizationId
      && stock.receiptLine.purchaseOrderLine.purchaseOrder.organization_id === organizationId
      ? stock.receiptLine
      : null;
    const master = masterByName.get(stock.raw_material.toLocaleLowerCase());
    const category = master?.raw_material_category.raw_material_category
      ?? receiptLine?.purchaseOrderLine.category?.trim()
      ?? "Uncategorized";
    const key = category.toLocaleLowerCase();
    const row = rows.get(key) ?? {
      id: key,
      category,
      totalValue: new Prisma.Decimal(0),
      unpricedQuantity: new Prisma.Decimal(0),
      days0To30Value: new Prisma.Decimal(0),
      days31To60Value: new Prisma.Decimal(0),
      days61To90Value: new Prisma.Decimal(0),
      daysOver90Value: new Prisma.Decimal(0),
    };

    const receivedAt = receiptLine?.receipt.received_date ?? stock.created_at;
    const bucket = `${ageBucket(daysBetween(receivedAt, asOf))}Value` as
      | "days0To30Value"
      | "days31To60Value"
      | "days61To90Value"
      | "daysOver90Value";
    const unitPrice = receiptLine?.purchaseOrderLine.price ?? master?.open_stock_price;
    if (unitPrice === null || unitPrice === undefined) {
      row.unpricedQuantity = row.unpricedQuantity.plus(onHand);
    } else {
      const value = onHand.times(unitPrice);
      row.totalValue = row.totalValue.plus(value);
      row[bucket] = row[bucket].plus(value);
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row): RawMaterialInventoryStatusRow => ({
      id: row.id,
      category: row.category,
      totalValue: Number(row.totalValue),
      unpricedQuantity: Number(row.unpricedQuantity),
      days0To30Value: Number(row.days0To30Value),
      days31To60Value: Number(row.days31To60Value),
      days61To90Value: Number(row.days61To90Value),
      daysOver90Value: Number(row.daysOver90Value),
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}

export { AGE_BUCKETS };
