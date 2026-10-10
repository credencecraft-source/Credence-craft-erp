import type { MasterDefinition } from "@/lib/master-data/master-data-registry";

export const MASTER_DATA_CATEGORIES = [
  {
    id: "raw-material",
    title: "Raw Material",
    routeSegment: "RAWMATERIL",
    description: "Raw materials, components, and their classifications.",
  },
  {
    id: "finished-goods",
    title: "Finished Goods",
    routeSegment: "FINISHED%20GOODS",
    description: "Finished goods products and their category masters.",
  },
  {
    id: "process-and-operations",
    title: "Process and Operations",
    routeSegment: "PROCESS%20AND%20OPERATIONS",
    description: "Production processes, operations, and reusable templates.",
  },
  {
    id: "vendors-and-contacts",
    title: "Vendors and Contacts",
    routeSegment: "VENDORS",
    description: "Vendor, buyer, and merchandiser contacts.",
  },
  {
    id: "tax-and-gst",
    title: "Tax and GST",
    routeSegment: "TAX%20AND%20GST",
    description: "GST rates, tax classifications, HSN codes, and states.",
  },
  {
    id: "sizes",
    title: "Size and Size Group",
    routeSegment: "SIZE%20AND%20SIZE%20GROUP",
    description: "Sizes, size groups, and their measurement charts.",
  },
  {
    id: "warehouses",
    title: "Warehouse",
    routeSegment: "WAREHOUSE",
    description: "Warehouses and warehouse types.",
  },
  {
    id: "other",
    title: "Others",
    routeSegment: "OTHERS",
    description: "Shared and organization-wide masters.",
  },
] as const;

export type MasterDataCategory = (typeof MASTER_DATA_CATEGORIES)[number];

const rawMaterialMasterKeys = new Set([
  "raw-material",
  "raw-material-type",
  "raw-material-category",
  "raw-material-sub-category",
  "category-type",
]);

const rawMaterialMasterOrder = [
  "raw-material-type",
  "raw-material-category",
  "raw-material-sub-category",
];

const finishedGoodsMasterKeys = new Set([
  "product-master",
  "category",
  "sub-category",
  "article",
]);

const finishedGoodsMasterOrder = [
  "product-master",
  "category",
  "sub-category",
  "article",
];

const processAndOperationsMasterKeys = new Set([
  "process-master",
  "operation",
  "process-template",
  "operation-template",
]);

const vendorsAndContactsMasterKeys = new Set(["vendor", "buyer", "merchandiser"]);
const taxAndGstMasterKeys = new Set(["gst", "gst-type", "hsn", "state"]);
const sizeMasterKeys = new Set(["size", "size-group", "measurement-chart"]);
const sizeMasterOrder = ["size", "size-group", "measurement-chart"];
const warehouseMasterKeys = new Set(["warehouse", "warehouse-type"]);

function normalizeCategoryRoute(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/%20/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function getMasterDataCategory(routeSegment: string) {
  const normalizedSegment = normalizeCategoryRoute(routeSegment);

  return MASTER_DATA_CATEGORIES.find((category) => (
    normalizeCategoryRoute(category.routeSegment) === normalizedSegment
  ));
}

export function getMastersForCategory(
  masters: MasterDefinition[],
  category: MasterDataCategory,
) {
  if (category.id === "raw-material") {
    const rawMaterialMasters = masters.filter((master) => rawMaterialMasterKeys.has(master.key));
    const order = new Map(rawMaterialMasterOrder.map((key, index) => [key, index]));

    return rawMaterialMasters.sort((left, right) => (
      (order.get(left.key) ?? rawMaterialMasterOrder.length) -
        (order.get(right.key) ?? rawMaterialMasterOrder.length) ||
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    ));
  }

  if (category.id === "finished-goods") {
    const finishedGoodsMasters = masters.filter((master) => finishedGoodsMasterKeys.has(master.key));
    const order = new Map(finishedGoodsMasterOrder.map((key, index) => [key, index]));

    return finishedGoodsMasters.sort((left, right) => (
      (order.get(left.key) ?? finishedGoodsMasterOrder.length) -
        (order.get(right.key) ?? finishedGoodsMasterOrder.length) ||
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    ));
  }

  if (category.id === "process-and-operations") {
    return masters.filter((master) => processAndOperationsMasterKeys.has(master.key));
  }

  if (category.id === "vendors-and-contacts") {
    return masters.filter((master) => vendorsAndContactsMasterKeys.has(master.key));
  }

  if (category.id === "tax-and-gst") {
    return masters.filter((master) => taxAndGstMasterKeys.has(master.key));
  }

  if (category.id === "sizes") {
    const sizeMasters = masters.filter((master) => sizeMasterKeys.has(master.key));
    const order = new Map(sizeMasterOrder.map((key, index) => [key, index]));

    return sizeMasters.sort((left, right) => (
      (order.get(left.key) ?? sizeMasterOrder.length) -
        (order.get(right.key) ?? sizeMasterOrder.length) ||
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    ));
  }

  if (category.id === "warehouses") {
    return masters.filter((master) => warehouseMasterKeys.has(master.key));
  }

  return masters.filter((master) => (
    !rawMaterialMasterKeys.has(master.key) &&
    !finishedGoodsMasterKeys.has(master.key) &&
    !processAndOperationsMasterKeys.has(master.key) &&
    !vendorsAndContactsMasterKeys.has(master.key) &&
    !taxAndGstMasterKeys.has(master.key) &&
    !sizeMasterKeys.has(master.key) &&
    !warehouseMasterKeys.has(master.key)
  ));
}
