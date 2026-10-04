import XlsxPopulate, { type Sheet } from "xlsx-populate";

import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";

const MAX_ORDER_ROWS = 500;
const DELIVERY_DATE_COLUMN = 11;

const ORDER_MASTER_COLUMNS = [
  { column: "Entity Name", key: "entity", rangeName: "OrderEntityNames" },
  { column: "Product Category", key: "category", rangeName: "OrderCategories" },
  { column: "Product Sub Category", key: "sub-category", rangeName: "OrderSubCategories" },
  { column: "Season", key: "season", rangeName: "OrderSeasons" },
  { column: "Article", key: "article", rangeName: "OrderArticles" },
  { column: "Colors", key: "color", rangeName: "OrderColors" },
  { column: "Buyer", key: "buyer", rangeName: "OrderBuyers" },
  { column: "Brand", key: "brand", rangeName: "OrderBrands" },
  { column: "Size Group", key: "size-group", rangeName: "OrderSizeGroups" },
] as const;

const ORDER_HEADERS = [
  "Entity Name",
  "Product Category",
  "Product Sub Category",
  "Season",
  "Article",
  "Style Name",
  "Colors",
  "Buyer",
  "Brand",
  "Size Group",
  "Delivery Date",
] as const;

type MasterOption = {
  id: string;
  value_id: string;
  label: string;
};

type TemplateMasterOptions = Record<string, MasterOption[]>;

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

function setHeaders(sheet: Sheet) {
  sheet.range(`A1:${columnName(ORDER_HEADERS.length)}1`).value([[...ORDER_HEADERS]]);
  sheet.range(`A1:${columnName(ORDER_HEADERS.length)}1`).style({ bold: true, fill: "E2F3EC" });
  sheet.freezePanes(1, 0);
  ORDER_HEADERS.forEach((header, index) => {
    sheet.column(columnName(index + 1)).width(Math.max(header.length + 3, 18));
  });
}

export async function createBulkOrderTemplate(masterOptions: TemplateMasterOptions) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const ordersSheet = workbook.sheet(0).name("Orders");
  const mastersSheet = workbook.addSheet("Masters");
  setHeaders(ordersSheet);

  ORDER_MASTER_COLUMNS.forEach(({ column, key, rangeName }, index) => {
    const values = [...new Set((masterOptions[key] ?? []).map((master) => master.label).filter(Boolean))];
    const masterColumn = columnName(index + 1);
    mastersSheet.cell(`${masterColumn}1`).value(column);
    if (values.length === 0) return;

    mastersSheet.range(`${masterColumn}2:${masterColumn}${values.length + 1}`).value(values.map((value) => [value]));
    workbook.definedName(rangeName, mastersSheet.range(`${masterColumn}2:${masterColumn}${values.length + 1}`));
    const orderColumn = ORDER_HEADERS.indexOf(column as (typeof ORDER_HEADERS)[number]) + 1;
    const columnLetter = columnName(orderColumn);
    const isRestrictedMaster = key === "entity" || key === "size-group";
    ordersSheet.range(`${columnLetter}2:${columnLetter}${MAX_ORDER_ROWS + 1}`).dataValidation({
      type: "list",
      allowBlank: true,
      showErrorMessage: isRestrictedMaster,
      ...(isRestrictedMaster ? {
        errorTitle: "Choose a master value",
        error: "Select a value from this organization's master list.",
      } : {}),
      formula1: rangeName,
    });
  });

  const dateColumn = columnName(DELIVERY_DATE_COLUMN);
  ordersSheet.range(`${dateColumn}2:${dateColumn}${MAX_ORDER_ROWS + 1}`).style("numberFormat", "yyyy-mm-dd");
  ordersSheet.range(`${dateColumn}2:${dateColumn}${MAX_ORDER_ROWS + 1}`).dataValidation({
    type: "date",
    operator: "between",
    allowBlank: true,
    showInputMessage: true,
    promptTitle: "Delivery Date",
    prompt: "Choose or enter a delivery date.",
    showErrorMessage: true,
    errorTitle: "Invalid delivery date",
    error: "Enter a valid date.",
    formula1: 1,
    formula2: 2958465,
  });

  mastersSheet.hidden(true);
  mastersSheet.freezePanes(1, 0);
  return workbook.outputAsync({ type: "nodebuffer" });
}

export async function getOrganizationBulkOrderTemplate(organizationId: string) {
  const lookupValues = await Promise.all(ORDER_MASTER_COLUMNS.map(async ({ key }) => [
    key,
    await getMasterValuesForOrganization(organizationId, key, false, {
      limit: 500,
      includeDummyData: true,
    }),
  ] as const));
  return createBulkOrderTemplate(Object.fromEntries(lookupValues));
}
