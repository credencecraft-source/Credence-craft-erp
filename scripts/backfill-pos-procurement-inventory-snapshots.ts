import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const confirmNonProduction = args.has("--confirm-non-production");
const prisma = new PrismaClient();

async function getMissingCounts() {
  return prisma.$queryRaw<Array<{ category: string; missing_count: string }>>`
    SELECT 'pos_sales_invoices.entity_name_snapshot' AS category, COUNT(*)::text AS missing_count
    FROM pos_sales_invoices WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'pos_sales_returns.entity_name_snapshot', COUNT(*)::text
    FROM pos_sales_returns WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'pos_purchase_bills.entity_name_snapshot', COUNT(*)::text
    FROM pos_purchase_bills WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'purchase_orders.entity_name_snapshot', COUNT(*)::text
    FROM purchase_orders WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'purchase_orders.grand_total', COUNT(*)::text
    FROM purchase_orders WHERE grand_total IS NULL
    UNION ALL
    SELECT 'master_purchase_orders.entity_name_snapshot', COUNT(*)::text
    FROM master_purchase_orders WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'grouped_purchase_orders.entity_name_snapshot', COUNT(*)::text
    FROM grouped_purchase_orders WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'inventory_receipts.entity_name_snapshot', COUNT(*)::text
    FROM inventory_receipts WHERE entity_name_snapshot IS NULL
    UNION ALL
    SELECT 'inventory_receipts.location_name_snapshot', COUNT(*)::text
    FROM inventory_receipts WHERE location_name_snapshot IS NULL
    UNION ALL
    SELECT 'grouped_purchase_order_lines.order_no_or_style_name', COUNT(*)::text
    FROM grouped_purchase_order_lines
    WHERE NULLIF(BTRIM(order_no), '') IS NULL OR NULLIF(BTRIM(style_name), '') IS NULL
  `;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured; load the authorized non-production environment first.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("This backfill refuses to run when NODE_ENV is production.");
  }
  if (applyChanges && !confirmNonProduction) {
    throw new Error("Applying this backfill requires both --apply and --confirm-non-production.");
  }
  if (!applyChanges && !args.has("--dry-run")) {
    throw new Error("Choose --dry-run or explicitly provide --apply --confirm-non-production.");
  }

  const before = await getMissingCounts();
  if (!applyChanges) {
    console.log(JSON.stringify({ mode: "dry-run", missing: before }, null, 2));
    return;
  }

  const changed = await prisma.$transaction(async (transaction) => ({
    posSalesInvoices: await transaction.$executeRaw`
      UPDATE pos_sales_invoices AS invoice
      SET entity_name_snapshot = entity.entity_name
      FROM master_entities AS entity
      WHERE invoice.organization_id = entity.organization_id
        AND invoice.entity_id = entity.id
        AND invoice.entity_name_snapshot IS NULL
    `,
    posSalesReturns: await transaction.$executeRaw`
      UPDATE pos_sales_returns AS sales_return
      SET entity_name_snapshot = COALESCE(invoice.entity_name_snapshot, entity.entity_name)
      FROM pos_sales_invoices AS invoice
      LEFT JOIN master_entities AS entity
        ON entity.organization_id = invoice.organization_id
        AND entity.id = invoice.entity_id
      WHERE sales_return.organization_id = invoice.organization_id
        AND sales_return.invoice_id = invoice.id
        AND sales_return.entity_name_snapshot IS NULL
        AND COALESCE(invoice.entity_name_snapshot, entity.entity_name) IS NOT NULL
    `,
    posPurchaseBills: await transaction.$executeRaw`
      UPDATE pos_purchase_bills AS bill
      SET entity_name_snapshot = entity.entity_name
      FROM master_entities AS entity
      WHERE bill.organization_id = entity.organization_id
        AND bill.entity_id = entity.id
        AND bill.entity_name_snapshot IS NULL
    `,
    posPurchaseBillStockEntitySnapshots: await transaction.$executeRaw`
      WITH bill_entities AS (
        SELECT line.purchase_bill_id, bill.organization_id, MIN(stock.entity_id) AS entity_id
        FROM pos_purchase_bill_lines AS line
        INNER JOIN pos_purchase_bills AS bill
          ON bill.id = line.purchase_bill_id
        INNER JOIN finished_goods_sku_stocks AS stock
          ON stock.purchase_bill_line_id = line.id
        WHERE bill.entity_id IS NULL
          AND bill.entity_name_snapshot IS NULL
        GROUP BY line.purchase_bill_id, bill.organization_id
        HAVING COUNT(DISTINCT stock.entity_id) = 1
      )
      UPDATE pos_purchase_bills AS bill
      SET entity_name_snapshot = entity.entity_name
      FROM bill_entities
      INNER JOIN master_entities AS entity
        ON entity.organization_id = bill_entities.organization_id
        AND entity.id = bill_entities.entity_id
      WHERE bill.id = bill_entities.purchase_bill_id
        AND bill.organization_id = bill_entities.organization_id
        AND bill.entity_id IS NULL
        AND bill.entity_name_snapshot IS NULL
    `,
    purchaseOrderEntities: await transaction.$executeRaw`
      UPDATE purchase_orders AS purchase_order
      SET entity_name_snapshot = entity.entity_name
      FROM master_entities AS entity
      WHERE purchase_order.organization_id = entity.organization_id
        AND purchase_order.entity_id = entity.id
        AND purchase_order.entity_name_snapshot IS NULL
    `,
    purchaseOrderTotals: await transaction.$executeRaw`
      WITH totals AS (
        SELECT
          purchase_order.id,
          ROUND(COALESCE(SUM(
            COALESCE(line.total, line.quantity * COALESCE(line.price, 0))
            + COALESCE(line.cgst_amount, 0)
            + COALESCE(line.sgst_amount, 0)
            + COALESCE(line.igst_amount, 0)
          ), 0), 2) AS grand_total
        FROM purchase_orders AS purchase_order
        LEFT JOIN purchase_order_lines AS line
          ON line.purchase_order_id = purchase_order.id
        WHERE purchase_order.grand_total IS NULL
        GROUP BY purchase_order.id
      )
      UPDATE purchase_orders AS purchase_order
      SET grand_total = totals.grand_total
      FROM totals
      WHERE purchase_order.id = totals.id
        AND purchase_order.grand_total IS NULL
    `,
    masterPurchaseOrders: await transaction.$executeRaw`
      UPDATE master_purchase_orders AS master_order
      SET entity_name_snapshot = entity.entity_name
      FROM master_entities AS entity
      WHERE master_order.organization_id = entity.organization_id
        AND master_order.entity_id = entity.id
        AND master_order.entity_name_snapshot IS NULL
    `,
    groupedPurchaseOrders: await transaction.$executeRaw`
      UPDATE grouped_purchase_orders AS grouped_order
      SET entity_name_snapshot = entity.entity_name
      FROM master_entities AS entity
      WHERE grouped_order.organization_id = entity.organization_id
        AND grouped_order.entity_id = entity.id
        AND grouped_order.entity_name_snapshot IS NULL
    `,
    inventoryReceipts: await transaction.$executeRaw`
      UPDATE inventory_receipts AS receipt
      SET
        entity_name_snapshot = COALESCE(receipt.entity_name_snapshot, entity.entity_name),
        location_name_snapshot = COALESCE(receipt.location_name_snapshot, location.location_name)
      FROM master_entities AS entity
      INNER JOIN master_locations AS location
        ON location.organization_id = entity.organization_id
        AND location.entity_id = entity.id
      WHERE receipt.organization_id = entity.organization_id
        AND receipt.entity_id = entity.id
        AND receipt.organization_id = location.organization_id
        AND receipt.entity_id = location.entity_id
        AND receipt.location_id = location.id
        AND (receipt.entity_name_snapshot IS NULL OR receipt.location_name_snapshot IS NULL)
    `,
    groupedPurchaseOrderLines: await transaction.$executeRaw`
      UPDATE grouped_purchase_order_lines AS line
      SET
        order_no = COALESCE(NULLIF(BTRIM(line.order_no), ''), NULLIF(BTRIM(order_record."orderNo"), '')),
        style_name = COALESCE(NULLIF(BTRIM(line.style_name), ''), NULLIF(BTRIM(order_record."styleName"), ''))
      FROM grouped_purchase_orders AS grouped_order
      INNER JOIN merchandising_orders AS order_record
        ON order_record.organization_id = grouped_order.organization_id
      WHERE line.grouped_purchase_order_id = grouped_order.id
        AND line.source_order_id = order_record.id
        AND (
          NULLIF(BTRIM(line.order_no), '') IS NULL
          OR NULLIF(BTRIM(line.style_name), '') IS NULL
        )
    `,
  }), { maxWait: 10_000, timeout: 120_000 });

  const after = await getMissingCounts();
  const verification = {
    purchaseOrders: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot, grand_total
      FROM purchase_orders
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    masterPurchaseOrders: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot
      FROM master_purchase_orders
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    groupedPurchaseOrders: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot
      FROM grouped_purchase_orders
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    posSalesInvoices: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot
      FROM pos_sales_invoices
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    posSalesReturns: await prisma.$queryRaw`
      SELECT id, invoice_id, entity_name_snapshot
      FROM pos_sales_returns
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    posPurchaseBills: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot
      FROM pos_purchase_bills
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    unresolvedPosPurchaseBillEntities: await prisma.$queryRaw`
      SELECT bill.id, bill.document_number, bill.status, bill.entity_id,
        COUNT(DISTINCT stock.entity_id)::int AS linked_stock_entity_count
      FROM pos_purchase_bills AS bill
      LEFT JOIN pos_purchase_bill_lines AS line
        ON line.purchase_bill_id = bill.id
      LEFT JOIN finished_goods_sku_stocks AS stock
        ON stock.purchase_bill_line_id = line.id
      WHERE bill.entity_name_snapshot IS NULL
      GROUP BY bill.id
      ORDER BY bill.created_at DESC
    `,
    unresolvedPosSalesInvoiceEntities: await prisma.$queryRaw`
      SELECT id, invoice_no, entity_id, status
      FROM pos_sales_invoices
      WHERE entity_name_snapshot IS NULL
      ORDER BY created_at DESC
    `,
    inventoryReceipts: await prisma.$queryRaw`
      SELECT id, entity_id, entity_name_snapshot, location_id, location_name_snapshot
      FROM inventory_receipts
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
    groupedPurchaseOrderLines: await prisma.$queryRaw`
      SELECT id, source_order_id, order_no, style_name
      FROM grouped_purchase_order_lines
      ORDER BY created_at DESC, id
      LIMIT 5
    `,
  };

  console.log(JSON.stringify({
    mode: "apply",
    changed,
    missingAfter: after,
    rawPostgresVerification: verification,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("POS, procurement, and inventory snapshot backfill failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
