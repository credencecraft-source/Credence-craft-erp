export type FinishedGoodsStockRecord = {
  id: string;
  source: string;
  current_stock: number | string;
  qty_in?: number | string;
  qty_out?: number | string;
  inventory_bucket?: "GENERAL" | "ALLOCATED";
  sku_code?: string | null;
  barcode?: string | null;
  style_name?: string | null;
  article_no?: string | null;
  brand?: string | null;
  size?: string | null;
  colour?: string | null;
  location?: { location_name: string } | null;
  added_time?: string | Date;
};

export type FinishedGoodsStockOverviewRow = {
  report_id: string;
  record_id: string;
  source_module: "Inventory" | "POS";
  source_label: string;
  main_source: "Inventory Module" | "POS Module";
  sub_source: "WO Order GRN" | "Packing List GRN" | "POS Bill" | "—";
  stock_type: "GENERAL" | "ALLOCATED";
  current_stock: number;
} & Omit<FinishedGoodsStockRecord, "current_stock"> & {
  current_stock: number;
  qty_in: number;
  qty_out: number;
};

export type FinishedGoodsStockOverview = {
  rows: FinishedGoodsStockOverviewRow[];
  total: number;
  general: number;
  allocated: number;
  inventory: number;
  pos: number;
};

export const GENERAL_FINISHED_GOODS_SKU_SOURCES = [
  "DIRECT",
  "DIRECT_FROM_INVENTORY",
  "DIRECT_FROM_POS",
  "PACKING_LIST_GRN",
  "POS",
  "POS_PURCHASE_BILL",
] as const;

const sourceLabels: Record<string, string> = {
  DIRECT: "Direct from Inventory",
  DIRECT_FROM_INVENTORY: "Direct from Inventory",
  DIRECT_FROM_POS: "Direct from POS",
  PACKING_LIST_GRN: "Packing List GRN",
  POS: "POS",
  POS_PURCHASE_BILL: "POS Purchase Bill",
  WO_ORDER_GRN: "Work Order GRN",
  WORK_ORDER_GRN: "Work Order GRN",
};

export function getFinishedGoodsSourceHierarchy(source: string): {
  main_source: "Inventory Module" | "POS Module";
  sub_source: "WO Order GRN" | "Packing List GRN" | "POS Bill" | "—";
} {
  const main_source = source === "DIRECT_FROM_POS" || source === "POS" || source.startsWith("POS_")
    ? "POS Module"
    : "Inventory Module";
  const sub_source = source === "WO_ORDER_GRN" || source === "WORK_ORDER_GRN"
    ? "WO Order GRN"
    : source === "PACKING_LIST_GRN"
      ? "Packing List GRN"
      : source === "POS" || source === "POS_PURCHASE_BILL" || source === "DIRECT_FROM_POS"
        ? "POS Bill"
        : "—";

  return { main_source, sub_source };
}

function quantity(value: number | string | undefined, field: string) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Finished-goods stock returned an invalid ${field} quantity.`);
  }
  return parsed;
}

function sourceModule(source: string): "Inventory" | "POS" {
  return source === "DIRECT_FROM_POS" || source === "POS" || source.startsWith("POS_")
    ? "POS"
    : "Inventory";
}

export function buildFinishedGoodsStockOverview(
  records: FinishedGoodsStockRecord[],
): FinishedGoodsStockOverview {
  const rows = records.map((record) => {
    const sourceOrigin = sourceModule(record.source);
    return {
      ...record,
      report_id: `${record.inventory_bucket ?? "GENERAL"}:${record.id}`,
      record_id: record.id,
      source_module: sourceOrigin,
      source_label: sourceLabels[record.source] ?? record.source.replaceAll("_", " "),
      ...getFinishedGoodsSourceHierarchy(record.source),
      stock_type: record.inventory_bucket ?? "GENERAL",
      current_stock: quantity(record.current_stock, "current stock"),
      qty_in: quantity(record.qty_in, "quantity in"),
      qty_out: quantity(record.qty_out, "quantity out"),
    };
  });

  const totals = rows.reduce((summary, row) => {
    summary.total += row.current_stock;
    summary[row.stock_type === "ALLOCATED" ? "allocated" : "general"] += row.current_stock;
    summary[row.source_module === "POS" ? "pos" : "inventory"] += row.current_stock;
    return summary;
  }, { total: 0, general: 0, allocated: 0, inventory: 0, pos: 0 });

  return { rows, ...totals };
}
