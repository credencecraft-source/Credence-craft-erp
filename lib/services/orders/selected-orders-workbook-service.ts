import XlsxPopulate, { type Sheet, type Workbook } from "xlsx-populate";
import JSZip from "jszip";

import { getMasterValuesForOrganization, getSizeGroupSizesForOrganization } from "@/lib/master-data/master-data-constants";
import { getOrderById } from "@/lib/services/orders/order-service";

const MAX_SELECTED_ORDERS = 100;
const BLANK_BOM_ROWS_PER_ORDER = 10;

const BOM_MASTER_COLUMNS = [
  { header: "Raw Material Type", key: "raw-material-type", rangeName: "BomRawMaterialTypes" },
  { header: "BOM Category", key: "raw-material-category", rangeName: "BomRawMaterialCategories" },
  { header: "BOM Subcategory", key: "raw-material-sub-category", rangeName: "BomRawMaterialSubCategories" },
  { header: "Raw Material", key: "raw-material", rangeName: "BomRawMaterials" },
  { header: "Stock UOM", key: "uom", rangeName: "BomStockUoms" },
  { header: "Size", key: "size", rangeName: "BomSizes" },
] as const;

const BOM_HEADERS = [
  "Order No",
  "Style Name",
  "Sub Product",
  ...BOM_MASTER_COLUMNS.map(({ header }) => header),
  "Buyer Consumption",
  "Buyer Price",
  "Internal Consumption",
  "Internal Price",
  "Itemwise Excess %",
] as const;

type SelectedOrder = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;
type MasterValue = Awaited<ReturnType<typeof getMasterValuesForOrganization>>[number];

export class SelectedOrdersWorkbookError extends Error {}

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function resolveSizeGroup(order: SelectedOrder, sizeGroups: MasterValue[]) {
  const orderGroup = String(order.sizeGroup ?? "").trim();
  const normalized = orderGroup.toLocaleLowerCase();
  const match = sizeGroups.find((group) =>
    [group.id, group.value_id, group.label].some((value) => String(value).trim().toLocaleLowerCase() === normalized),
  );
  if (!match) {
    throw new SelectedOrdersWorkbookError(`Size Group "${orderGroup || "(empty)"}" for order ${order.orderNo} is not available in this organization's masters.`);
  }
  return match;
}

async function addMasterValidation(
  workbook: Workbook,
  sheet: Sheet,
  column: string,
  rangeName: string,
  lastRow: number,
  masterValues: MasterValue[],
) {
  const values = [...new Set(masterValues.map((master) => master.label.trim()).filter(Boolean))];
  if (values.length === 0) return;
  const mastersSheet = workbook.sheet("Masters");
  const masterColumn = columnName(BOM_MASTER_COLUMNS.findIndex((entry) => entry.rangeName === rangeName) + 1);
  const endRow = values.length + 1;
  mastersSheet.range(`${masterColumn}2:${masterColumn}${endRow}`).value(values.map((value) => [value]));
  workbook.definedName(rangeName, mastersSheet.range(`${masterColumn}2:${masterColumn}${endRow}`));
  sheet.range(`${column}2:${column}${lastRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    formula1: rangeName,
  });
}

async function removeWorksheetProtection(workbookBuffer: Buffer) {
  const archive = await JSZip.loadAsync(workbookBuffer);
  const worksheetFiles = Object.entries(archive.files)
    .filter(([path, file]) => path.startsWith("xl/worksheets/") && path.endsWith(".xml") && !file.dir);

  for (const [path, file] of worksheetFiles) {
    const xml = await file.async("string");
    const unprotectedXml = xml.replace(/<sheetProtection\b[^>]*(?:\/>|>[\s\S]*?<\/sheetProtection>)/g, "");
    archive.file(path, unprotectedXml);
  }

  const workbookFile = archive.file("xl/workbook.xml");
  if (workbookFile) {
    const xml = await workbookFile.async("string");
    archive.file("xl/workbook.xml", xml.replace(/<workbookProtection\b[^>]*(?:\/>|>[\s\S]*?<\/workbookProtection>)/g, ""));
  }

  return archive.generateAsync({ type: "nodebuffer" });
}

export async function createSelectedOrdersWorkbook(
  organizationId: string,
  orderIds: string[],
) {
  if (orderIds.length < 2 || orderIds.length > MAX_SELECTED_ORDERS) {
    throw new SelectedOrdersWorkbookError(`Select between 2 and ${MAX_SELECTED_ORDERS} orders to create the workbook.`);
  }
  if (new Set(orderIds).size !== orderIds.length) {
    throw new SelectedOrdersWorkbookError("The selected order list contains duplicates.");
  }

  const selectedOrders = await Promise.all(orderIds.map((id) => getOrderById(id, organizationId)));
  if (selectedOrders.some((order) => order === null)) {
    throw new SelectedOrdersWorkbookError("One or more selected orders are unavailable in this organization.");
  }
  const orders = selectedOrders as SelectedOrder[];
  const selectedSizeGroupLabels = orders.map((order) => String(order.sizeGroup ?? "").trim().toLocaleLowerCase());
  if (new Set(selectedSizeGroupLabels).size !== 1 || selectedSizeGroupLabels.includes("")) {
    throw new SelectedOrdersWorkbookError("Select orders with the same Size Group to create this workbook.");
  }
  const masterKeys = [...new Set([...BOM_MASTER_COLUMNS.map(({ key }) => key)])];
  const [sizeGroups, ...masterValues] = await Promise.all([
    getMasterValuesForOrganization(organizationId, "size-group", false, { limit: 500 }),
    ...masterKeys.map((key) => getMasterValuesForOrganization(organizationId, key, false, { limit: 500 })),
  ]);
  const orderSizeGroups = orders.map((order) => resolveSizeGroup(order, sizeGroups));
  const firstGroupId = orderSizeGroups[0].id;
  if (orderSizeGroups.some((group) => group.id !== firstGroupId)) {
    throw new SelectedOrdersWorkbookError("Select orders with the same Size Group to create this workbook.");
  }

  const sizeLinks = await getSizeGroupSizesForOrganization(organizationId, [firstGroupId]);
  const sizes = [...new Set(sizeLinks.filter((link) => link.size.is_active).map((link) => link.size.label))];
  if (sizes.length === 0) {
    throw new SelectedOrdersWorkbookError(`No active sizes are configured for Size Group "${orderSizeGroups[0].label}".`);
  }

  const workbook = await XlsxPopulate.fromBlankAsync();
  const finishedGoodsSheet = workbook.sheet(0).name("Finished Goods");
  const finishedGoodsHeaders = ["Order No", "Style Name", "Sub Product", "Size Group", ...sizes];
  const finishedGoodsEndColumn = columnName(finishedGoodsHeaders.length);
  finishedGoodsSheet.range(`A1:${finishedGoodsEndColumn}1`).value([finishedGoodsHeaders]);
  finishedGoodsSheet.range(`A1:${finishedGoodsEndColumn}1`).style({ bold: true, fill: "E2F3EC" });
  finishedGoodsSheet.freezePanes(1, 0);
  finishedGoodsHeaders.forEach((header, index) => {
    finishedGoodsSheet.column(columnName(index + 1)).width(Math.max(header.length + 3, 16));
  });

  orders.forEach((order, orderIndex) => {
    const row = orderIndex + 2;
    const metadata = [order.orderNo, order.styleName ?? "", order.subCategory ?? "", orderSizeGroups[orderIndex].label];
    finishedGoodsSheet.range(`A${row}:D${row}`).value([metadata]);
    sizes.forEach((_, sizeIndex) => {
      const address = `${columnName(sizeIndex + 5)}${row}`;
      finishedGoodsSheet.cell(address).value("");
    });
  });
  finishedGoodsSheet.range(`A2:D${orders.length + 1}`).style({ fill: "F1F5F9" });
  finishedGoodsSheet.range(`${columnName(5)}2:${finishedGoodsEndColumn}${orders.length + 1}`).style({ fill: "FEF3C7" });
  const masterValuesByKey = new Map(masterKeys.map((key, index) => [key, masterValues[index]]));

  const bomSheets = orders.map((order, orderIndex) => {
    const orderSheetName = `BOM ${orderIndex + 1}-${order.orderNo}`
      .replace(/[\[\]:*?/\\]/g, "-")
      .slice(0, 31);
    const sheet = workbook.addSheet(orderSheetName);
    const lastRow = BLANK_BOM_ROWS_PER_ORDER + 1;
    sheet.range(`A1:${columnName(BOM_HEADERS.length)}1`).value([[...BOM_HEADERS]]);
    sheet.range(`A1:${columnName(BOM_HEADERS.length)}1`).style({ bold: true, fill: "E2F3EC" });
    sheet.freezePanes(1, 0);
    BOM_HEADERS.forEach((header, index) => {
      sheet.column(columnName(index + 1)).width(Math.max(header.length + 3, 16));
    });

    const identifierRows = Array.from({ length: BLANK_BOM_ROWS_PER_ORDER }, () => [
      order.orderNo,
      order.styleName ?? "",
      order.subCategory ?? "",
    ]);
    sheet.range(`A2:C${lastRow}`).value(identifierRows);
    sheet.range(`A2:C${lastRow}`).style({ fill: "F1F5F9" });
    sheet.range(`D2:${columnName(BOM_HEADERS.length)}${lastRow}`).style({ fill: "FEF3C7" });
    return { sheet, worksheetPath: `xl/worksheets/sheet${orderIndex + 2}.xml`, lastRow };
  });

  const mastersSheet = workbook.addSheet("Masters");
  BOM_MASTER_COLUMNS.forEach((entry, index) => {
    const masterColumn = columnName(index + 1);
    mastersSheet.cell(`${masterColumn}1`).value(entry.header);
  });
  mastersSheet.hidden(true);

  await Promise.all(bomSheets.map(({ sheet, lastRow }) =>
    Promise.all(BOM_MASTER_COLUMNS.map(({ key, rangeName }, index) =>
      addMasterValidation(workbook, sheet, columnName(index + 4), rangeName, lastRow, masterValuesByKey.get(key) ?? []),
    )),
  ));

  const workbookBuffer = await workbook.outputAsync({ type: "nodebuffer" });
  return removeWorksheetProtection(workbookBuffer);
}
