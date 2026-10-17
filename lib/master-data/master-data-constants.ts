import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { enforceInventoryLocationLimit } from "@/lib/services/platform/inventory-location-restriction-service";
import { syncFinishedGoodsSizes, type FinishedGoodsSizePriceInput } from "@/lib/services/master-data/finished-goods-size-service";
import { parseFinishedGoodsPrice, syncFinishedGoodsVariants, type FinishedGoodsVariantInput } from "@/lib/services/master-data/finished-goods-variant-service";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-registry";
export { getMasterDefinition, MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";

export type MasterFieldValues = Record<string, string | number | boolean | null | string[] | number[] | Record<string, unknown>[]>;
export type ActiveMasterLookupRecord = {
  id: string;
  value_id: string;
  label: string;
  parent_id: string | null;
};
export type ActiveMasterLookupIndex = Map<string, Map<string, ActiveMasterLookupRecord[]>>;

type MasterRow = { id: string; value_id: string; organization_id: string; is_active: boolean; sort_order: number; [key: string]: unknown };
type MasterQuery = Record<string, unknown>;
type MasterDelegate = {
  findMany(args: MasterQuery): Promise<MasterRow[]>;
  findFirst(args: MasterQuery): Promise<MasterRow | null>;
  create(args: MasterQuery): Promise<MasterRow>;
  update(args: MasterQuery): Promise<MasterRow>;
  delete(args: MasterQuery): Promise<MasterRow>;
  deleteMany(args: MasterQuery): Promise<{ count: number }>;
  count(args: MasterQuery): Promise<number>;
  upsert(args: MasterQuery): Promise<MasterRow>;
};

function belongsToDummyBatch(record: Record<string, unknown>, batchId: string) {
  const metadata = record.legacy_metadata;
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).dummyDataBatchId === batchId;
}

async function isActiveDummyMaster(organizationId: string, record: MasterRow) {
  const batch = await prisma.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(batch && belongsToDummyBatch(record, batch.id));
}

const delegates = {
  entity: prisma.masterEntity, location: prisma.masterLocation, "category-type": prisma.masterCategoryType, category: prisma.masterCategory, "sub-category": prisma.masterSubCategory,
  brand: prisma.masterBrand, "pre-order-checklist": prisma.masterPreOrderChecklist, "currency-type": prisma.masterCurrencyType, buyer: prisma.masterBuyer,
  season: prisma.masterSeason, article: prisma.masterArticle, "article-variant": prisma.masterArticleVariant, "gold-seal": prisma.masterGoldSeal, "gold-seal-variant": prisma.masterGoldSealVariant, color: prisma.masterColor, "size-group": prisma.masterSizeGroup, size: prisma.masterSize,
  uom: prisma.masterUom, "stock-uom-convert": prisma.masterStockUomConvert, "raw-material": prisma.masterRawMaterial, vendor: prisma.masterVendor, "gst-type": prisma.masterGstType, gst: prisma.masterGst,
  hsn: prisma.masterHsn, state: prisma.masterState, "measurement-chart": prisma.masterMeasurementChart, "size-wise-consumption": prisma.masterSizeWiseConsumption,
  "product-master": prisma.masterProduct, "process-master": prisma.masterProcess, operation: prisma.masterOperation, "process-template": prisma.masterProcessTemplate, "process-template-step": prisma.masterProcessTemplateStep, "operation-template": prisma.masterOperationTemplate, "operation-template-step": prisma.masterOperationTemplateStep, merchandiser: prisma.masterMerchandiser, status: prisma.masterStatus,
  "order-volume": prisma.masterOrderVolume,
  "raw-material-type": prisma.masterRawMaterialType, "raw-material-category": prisma.masterRawMaterialCategory, "raw-material-sub-category": prisma.masterRawMaterialSubCategory,
} as unknown as Record<string, MasterDelegate>;

const masterModulesWithoutLegacyMetadata = new Set(["article-variant"]);

const transactionDelegateNames: Record<string, string> = {
  entity: "masterEntity",
  location: "masterLocation",
  category: "masterCategory",
  "sub-category": "masterSubCategory",
  brand: "masterBrand",
  "pre-order-checklist": "masterPreOrderChecklist",
  "currency-type": "masterCurrencyType",
  buyer: "masterBuyer",
  season: "masterSeason",
  color: "masterColor",
  "size-group": "masterSizeGroup",
  size: "masterSize",
  "product-master": "masterProduct",
  "process-master": "masterProcess",
  "process-template": "masterProcessTemplate",
  merchandiser: "masterMerchandiser",
  "order-volume": "masterOrderVolume",
  "raw-material-sub-category": "masterRawMaterialSubCategory",
};

export function isMasterSectionBulkDeletable(moduleKey: string) {
  return Boolean(transactionDelegateNames[moduleKey] && delegates[moduleKey]);
}

const labelFields: Record<string, string> = {
  entity: "entity_name", location: "location_name", "category-type": "category_type", category: "category_name", "sub-category": "sub_category", brand: "brand",
  "pre-order-checklist": "pre_order_checklist", "currency-type": "currency_type", buyer: "buyer_name", season: "season", article: "article", "article-variant": "variant", "gold-seal": "gold_seal", "gold-seal-variant": "variant", color: "colors",
  "size-group": "size_group", size: "size", uom: "uom", "stock-uom-convert": "name", "raw-material": "raw_material_name", vendor: "vendor", "gst-type": "gst_type", gst: "name",
  hsn: "hsn_code", state: "state", "measurement-chart": "measurement_chart", "size-wise-consumption": "bom_template_name", "product-master": "product_master_name",
  "process-master": "process_name", operation: "operation_name", "process-template": "process_name", "process-template-step": "process_name", "operation-template": "operation_template_name", "operation-template-step": "operation", merchandiser: "merchandiser", status: "status", "order-volume": "order_volume",
  "raw-material-type": "raw_material_type", "raw-material-category": "raw_material_category", "raw-material-sub-category": "raw_material_sub_category",
};

const fieldColumns: Record<string, Record<string, string>> = {
  entity: { entity_name: "entity_name" },
  location: { location_name: "location_name", entity_id: "entity_id" },
  "category-type": { Category_Type1: "category_type", Books_Item_ID: "books_item_id" },
  category: { Product_Master: "product_master_id", Category_Name: "category_name", Maximum_Excess_Allowed: "maximum_excess_allowed", Create_Cost_Center: "create_cost_center", Status: "status" },
  "sub-category": { category: "category_id", sub_category: "sub_category" },
  brand: { Brand: "brand", Maximum_Allowed_Excess: "maximum_allowed_excess", Auto_add_Excess_to_RM: "auto_add_excess_to_rm", Pre_Order_Checklist1: "pre_order_checklist_id", Status: "status" },
  buyer: { Buyer_Name: "buyer_name", Buyer_Email: "buyer_email", Currency_Type: "currency_type_id", Status: "status" },
  season: { season: "season" },
  article: { article: "article", article_code: "article_code", Brand: "brand_id", Product_Master: "product_master_id", Category: "category_id", Subcategory: "sub_category_id", Size_Group: "size_group_id", default_price: "default_price", design_by: "design_by", designed_date: "designed_date" },
  "article-variant": { variant: "variant", color: "color_id", variant_code: "variant_code", sku: "sku", price_override: "price_override" },
  "gold-seal": { gold_seal: "gold_seal", gold_seal_code: "gold_seal_code", design_by: "design_by", designed_date: "designed_date" },
  "gold-seal-variant": { variant: "variant", variant_code: "variant_code", color: "color", size: "size", sku: "sku", barcode: "barcode" },
  color: { Colors: "colors", Status: "status" },
  "size-group": { Brand1: "brand_id", Size_Group: "size_group", Measurement_Chart1: "measurement_chart_id" },
  size: { Size: "size", Size_Group_ID: "size_group_id", status: "status" }, uom: { uom: "uom" }, "stock-uom-convert": { Name: "name", How_Many: "how_many" }, vendor: { vendor: "vendor", Contact_Person: "legacy_metadata.contact_person", Contact_Phone: "legacy_metadata.contact_phone", Contact_Email: "legacy_metadata.contact_email", Gst_Number: "gst_number", Registered_State: "registered_state_id", Is_this_Current_Store: "is_current_store" }, state: { State: "state" },
  gst: { Name: "name", Gst: "gst", Cgst_Rate: "cgst_rate", Sgst_Rate: "sgst_rate", Igst_Rate: "igst_rate", GST_TYPELOOKUP1: "gst_type_id", Zoho_Books_Tax_ID: "zoho_books_tax_id" }, hsn: { Hsn_Code: "hsn_code" },
  "pre-order-checklist": { Pre_Order_Checklist: "pre_order_checklist" }, "currency-type": { Currency_Type: "currency_type" }, "gst-type": { GST_TYPE: "gst_type" },
  "measurement-chart": { Measurement_Chart: "measurement_chart" }, "size-wise-consumption": { Bom_Template_Name: "bom_template_name" },
  "product-master": { Product_Master_name: "product_master_name" }, "process-master": { Process_Name: "process_name" }, "process-template": { Process_Template_Name: "process_name", First_Process: "legacy_metadata.first_process_id", Last_Process: "legacy_metadata.last_process_id" }, "process-template-step": { Process: "process_id", Operation_Template: "operation_template_id", Sl_No: "sl_no", Is_Returnable_Process: "legacy_metadata.is_returnable_process", Block_By: "legacy_metadata.block_by_process_id" }, "operation-template": { Operation_Template_Name: "operation_template_name", Process: "process_id" }, "operation-template-step": { Operation: "operation", Sl_No: "sl_no", Price: "price" }, merchandiser: { merchandiser: "merchandiser" },
  status: { status: "status" }, "order-volume": { Order_Volume: "order_volume", From: "from_value", To: "to_value" },
  "raw-material-type": { Raw_Material_Type: "raw_material_type" },
  "raw-material-category": { Raw_Material_Type1: "raw_material_type_id", Raw_Material_Category: "raw_material_category", Create_Cost_Center: "create_cost_center" },
  "raw-material-sub-category": { Raw_Material_Category1: "raw_material_category_id", Raw_Material_Sub_Category: "raw_material_sub_category" },
  "raw-material": { Raw_Material_Name: "raw_material_name", Category: "raw_material_category_id", Subcategory: "raw_material_sub_category_id", Stock_Uom1: "stock_uom_id", Category_Type: "raw_material_type_id", Is_this_Specific_for_a_Brand: "is_specific_for_brand", Size_Wise_Concemption: "size_wise_consumption", Size_Wise_Consemption_Master: "size_wise_consumption_id", Brand1: "brand_id", Show_All1: "show_all", Workdrive_Image_ID: "workdrive_image_id", Buyer_Item_Code: "buyer_item_code", Image_Url: "image_url", Item_Code: "item_code", Colour: "colour_id", Create_open_stock: "create_open_stock", Open_Stock: "open_stock", Open_Stock_Price: "open_stock_price", Vendor_Wise_Price_List: "vendor_wise_price_list" },
};

const parentColumns: Record<string, string> = {
  "article-variant": "article_id",
  category: "product_master_id",
  "sub-category": "category_id",
  "raw-material-category": "raw_material_type_id",
  "raw-material-sub-category": "raw_material_category_id",
  size: "size_group_id",
  "process-template-step": "process_template_id",
  "operation-template-step": "operation_template_id",
  "stock-uom-convert": "stock_uom_id",
  "gold-seal-variant": "gold_seal_id",
};

function typedValue(field: MasterFieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "checkbox") return value === true || value === "true" || value === "on";
  if (["number", "percentage", "decimal"].includes(field.type)) return Number(value);
  if (field.type === "date") {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") {
      const dateValue = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return `${dateValue}T00:00:00.000Z`;
      return dateValue;
    }
    return String(value);
  }
  return String(value);
}

async function nextArticleCode(organizationId: string, database: MasterDelegate = delegates.article) {
  const existing = await database.findMany({ where: { organization_id: organizationId }, select: { article_code: true }, orderBy: { sort_order: "asc" } });
  const numbers = existing
    .map((item) => /^AR-?(\d+)$/i.exec(String(item.article_code ?? "")))
    .map((match) => Number(match?.[1]))
    .filter((value) => Number.isSafeInteger(value));
  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `AR${nextNumber}`;
}

async function nextGoldSealCode(organizationId: string, database: MasterDelegate = delegates["gold-seal"]) {
  const existing = await database.findMany({ where: { organization_id: organizationId }, select: { gold_seal_code: true }, orderBy: { sort_order: "asc" } });
  const numbers = existing
    .map((item) => Number(String(item.gold_seal_code ?? "").replace(/\D+/g, "")))
    .filter((value) => Number.isFinite(value));
  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `GS-${nextNumber}`;
}

async function resolveLookupId(
  organizationId: string,
  moduleKey: string,
  value: unknown,
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  if (!value) return null;
  const activeDummyBatch = await database.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  const delegateName = moduleKey === "product-master"
    ? "masterProduct"
    : moduleKey === "process-master"
      ? "masterProcess"
    : `master${moduleKey.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`;
  const delegate = (database as unknown as Record<string, MasterDelegate>)[delegateName] ?? delegates[moduleKey];
  const result = await delegate.findFirst({ where: {
    organization_id: organizationId,
    OR: [{ id: String(value) }, { value_id: String(value) }, { [labelFields[moduleKey]]: String(value) }],
  } });
  if (!result) throw new Error(`${getMasterDefinition(moduleKey)?.label ?? moduleKey} lookup value was not found in this organization.`);
  if (activeDummyBatch && belongsToDummyBatch(result, activeDummyBatch.id)) {
    throw new Error("Dummy master values cannot be used by regular organization records.");
  }
  return result.id;
}

function resolveLookupIdFromIndex(
  index: ActiveMasterLookupIndex,
  moduleKey: string,
  value: unknown,
  parentModuleKey?: string,
  parentValue?: unknown,
) {
  const key = String(value).toLocaleLowerCase();
  const candidates = index.get(moduleKey)?.get(key) ?? [];
  if (!parentModuleKey || parentValue === null || parentValue === undefined || parentValue === "") {
    return candidates[0]?.id ?? null;
  }
  const parentKeys = index.get(parentModuleKey)?.get(String(parentValue).toLocaleLowerCase()) ?? [];
  const parentIds = new Set(parentKeys.map((parent) => parent.id));
  return candidates.find((candidate) => candidate.parent_id !== null && parentIds.has(candidate.parent_id))?.id ?? null;
}

export async function isActiveMasterLookupForOrganization(
  organizationId: string,
  moduleKey: string,
  value: string,
  parentModuleKey?: string,
  parentValue?: string,
) {
  const delegate = delegates[moduleKey];
  const labelField = labelFields[moduleKey];
  if (!delegate || !labelField) return false;

  const where: Record<string, unknown> = {
    organization_id: organizationId,
    is_active: true,
    OR: [
      { id: value },
      { value_id: value },
      { [labelField]: { equals: value, mode: "insensitive" } },
    ],
  };
  if (parentModuleKey && parentValue) {
    const parentDelegate = delegates[parentModuleKey];
    const parentLabelField = labelFields[parentModuleKey];
    const parentColumn = parentColumns[moduleKey];
    if (!parentDelegate || !parentLabelField || !parentColumn) return false;
    const parent = await parentDelegate.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        OR: [
          { id: parentValue },
          { value_id: parentValue },
          { [parentLabelField]: { equals: parentValue, mode: "insensitive" } },
        ],
      },
    });
    if (!parent || await isActiveDummyMaster(organizationId, parent)) return false;
    where[parentColumn] = parent.id;
  }
  const record = await delegate.findFirst({ where });
  return Boolean(record && !(await isActiveDummyMaster(organizationId, record)));
}

export async function loadActiveMasterLookupIndex(
  organizationId: string,
  moduleKeys: Iterable<string>,
): Promise<ActiveMasterLookupIndex> {
  const keys = [...new Set(moduleKeys)].filter((moduleKey) =>
    Boolean(delegates[moduleKey] && labelFields[moduleKey]),
  );
  if (keys.length === 0) return new Map();
  const activeDummyBatch = await prisma.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  const entries = await Promise.all(keys.map(async (moduleKey) => {
    const labelField = labelFields[moduleKey];
    const parentColumn = parentColumns[moduleKey];
    const records = await delegates[moduleKey].findMany({
      where: { organization_id: organizationId, is_active: true },
      select: {
        id: true,
        value_id: true,
        [labelField]: true,
        ...(masterModulesWithoutLegacyMetadata.has(moduleKey) ? {} : { legacy_metadata: true }),
        ...(parentColumn ? { [parentColumn]: true } : {}),
      },
    });
    const index = new Map<string, ActiveMasterLookupRecord[]>();
    for (const record of records) {
      if (activeDummyBatch && belongsToDummyBatch(record, activeDummyBatch.id)) continue;
      const entry: ActiveMasterLookupRecord = {
        id: record.id,
        value_id: record.value_id,
        label: String(record[labelField] ?? ""),
        parent_id: parentColumn && typeof record[parentColumn] === "string"
          ? record[parentColumn] as string
          : null,
      };
      for (const value of [entry.id, entry.value_id, entry.label]) {
        const lookupKey = value.toLocaleLowerCase();
        const matching = index.get(lookupKey) ?? [];
        matching.push(entry);
        index.set(lookupKey, matching);
      }
    }
    return [moduleKey, index] as const;
  }));
  return new Map(entries);
}

export function isActiveMasterLookupInIndex(
  index: ActiveMasterLookupIndex,
  moduleKey: string,
  value: string,
  parentModuleKey?: string,
  parentValue?: string,
) {
  const matches = index.get(moduleKey)?.get(value.toLocaleLowerCase()) ?? [];
  if (!parentModuleKey || !parentValue) return matches.length > 0;
  const parents = index.get(parentModuleKey)?.get(parentValue.toLocaleLowerCase()) ?? [];
  if (parents.length === 0) return false;
  const parentIds = new Set(parents.map((parent) => parent.id));
  return matches.some((record) => record.parent_id !== null && parentIds.has(record.parent_id));
}

function valueForMasterField(row: MasterRow, column: string) {
  if (!column.startsWith("legacy_metadata.")) return row[column];
  const metadataKey = column.slice("legacy_metadata.".length);
  const metadata = row.legacy_metadata;
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    const metadataValue = (metadata as Record<string, unknown>)[metadataKey];
    if (metadataValue !== undefined && metadataValue !== null) return metadataValue;
  }
  return row[metadataKey];
}

async function buildData(
  organizationId: string,
  moduleKey: string,
  fields: MasterFieldValues,
  label: string,
  existingLegacyMetadata?: unknown,
  lookupIndex?: ActiveMasterLookupIndex,
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const definition = getMasterDefinition(moduleKey);
  if (!definition) throw new Error("Master module is not available.");

  const legacyMetadata = typeof existingLegacyMetadata === "object"
    && existingLegacyMetadata !== null
    && !Array.isArray(existingLegacyMetadata)
    ? { ...(existingLegacyMetadata as Record<string, unknown>) }
    : {};
  let hasLegacyMetadataUpdates = false;
  const data: Record<string, unknown> = {
    organization_id: organizationId,
    [labelFields[moduleKey]]: label,
  };

  for (const field of definition.fields) {
    if (moduleKey === "article" && field.key === "Sizes") continue;
    const relationField = fieldColumns[moduleKey]?.[field.key];
    if (!relationField || relationField === labelFields[moduleKey]) continue;
    const legacyMetadataKey = relationField.startsWith("legacy_metadata.")
      ? relationField.slice("legacy_metadata.".length)
      : null;

    if (field.key === "running_order_qty" || field.key === "running_order_variants") {
      continue;
    }

    if (field.type === "lookup") {
      const parentValue = field.dependsOn ? fields[field.dependsOn] : null;
      const isMissingDependency = field.dependsOn && (parentValue === null || parentValue === undefined || parentValue === "");
      const hasValue = fields[field.key] !== null && fields[field.key] !== undefined && fields[field.key] !== "";

      if (field.required && isMissingDependency) {
        throw new Error(`${field.label} must be linked to ${definition.fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? "its parent field"}.`);
      }

      if (field.required && !hasValue) {
        throw new Error(`${field.label} is required.`);
      }

      if (field.type === "lookup" && hasValue) {
        const parentField = field.dependsOn
          ? definition.fields.find((candidate) => candidate.key === field.dependsOn)
          : undefined;
        const targetId = lookupIndex
          ? resolveLookupIdFromIndex(
              lookupIndex,
              field.lookupModuleKey ?? "",
              fields[field.key],
              parentField?.lookupModuleKey,
              field.dependsOn ? fields[field.dependsOn] : undefined,
            )
          : await resolveLookupId(organizationId, field.lookupModuleKey ?? "", fields[field.key], database);
        if (lookupIndex && !targetId) {
          throw new Error(`${getMasterDefinition(field.lookupModuleKey ?? "")?.label ?? field.label} lookup value was not found in this organization.`);
        }
        if (targetId) {
          if (legacyMetadataKey) {
            legacyMetadata[legacyMetadataKey] = targetId;
            hasLegacyMetadataUpdates = true;
          } else {
            data[relationField] = targetId;
          }
          if (moduleKey === "vendor" && field.key === "Registered_State") {
            data.registered_state = String(fields[field.key]);
          }
        }
        continue;
      }

      if (legacyMetadataKey) {
        legacyMetadata[legacyMetadataKey] = null;
        hasLegacyMetadataUpdates = true;
        continue;
      }
    }

    const val = moduleKey === "article" && field.key === "default_price"
      ? fields[field.key] === null || fields[field.key] === undefined || fields[field.key] === ""
        ? null
        : parseFinishedGoodsPrice(fields[field.key], "Default price")
      : typedValue(field, fields[field.key]);
    if (val !== null) {
      if (legacyMetadataKey) {
        legacyMetadata[legacyMetadataKey] = val;
        hasLegacyMetadataUpdates = true;
      } else {
        data[relationField] = val;
      }
    } else if (moduleKey === "article" && ["Product_Master", "Category", "Subcategory", "Size_Group", "default_price"].includes(field.key)) {
      data[relationField] = null;
    }
  }

  if (hasLegacyMetadataUpdates) data.legacy_metadata = legacyMetadata;
  if (moduleKey === "article") {
    const categoryId = data.category_id;
    const productMasterId = data.product_master_id;
    const subCategoryId = data.sub_category_id;
    if (categoryId) {
      const category = await database.masterCategory.findFirst({
        where: { organization_id: organizationId, id: String(categoryId) },
        select: { product_master_id: true },
      });
      if (!category || (productMasterId && category.product_master_id !== productMasterId)) {
        throw new Error("Finished Goods Category must belong to the selected Finished Goods Type.");
      }
    }
    if (subCategoryId) {
      if (!categoryId) {
        throw new Error("Select a Finished Goods Category before selecting a subcategory.");
      }
      const subCategory = await database.masterSubCategory.findFirst({
        where: { organization_id: organizationId, id: String(subCategoryId), category_id: String(categoryId) },
        select: { id: true },
      });
      if (!subCategory) {
        throw new Error("Finished Goods Subcategory must belong to the selected category.");
      }
    }
  }
  return data;
}

function rowFields(
  moduleKey: string,
  row: MasterRow,
  definition: NonNullable<ReturnType<typeof getMasterDefinition>>,
  includeArticleMetrics = true,
) {
  const fields: MasterFieldValues = {};
  for (const field of definition.fields) {
    const column = fieldColumns[moduleKey]?.[field.key];
    if (!column) continue;
    if (moduleKey === "article"
      && (field.key === "running_order_qty" || field.key === "running_order_variants")
      && !includeArticleMetrics) {
      continue;
    }
    const value = valueForMasterField(row, column);
    fields[field.key] = value === null || value === undefined
      ? null
      : field.type === "date"
        ? value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
        : field.type === "decimal" && ((moduleKey === "article" && field.key === "default_price")
          || (moduleKey === "article-variant" && field.key === "price_override"))
          ? String(value)
        : ["number", "percentage", "decimal"].includes(field.type)
          ? Number(value)
          : (value as MasterFieldValues[string]);
  }
  return fields;
}

export async function getMasterValuesForOrganization(
  organizationId: string,
  moduleKey: string,
  includeInactive = false,
  options: {
    search?: string;
    limit?: number;
    exactSearch?: boolean;
    includeDummyData?: boolean;
    entityId?: string;
    articleCode?: string;
    includeArticleMetrics?: boolean;
    includeArticleDetails?: boolean;
    activeDummyDataBatch?: { id: string } | null | Promise<{ id: string } | null>;
    onRowsFetched?: (rowIds: string[]) => void | Promise<void>;
  } = {},
) {
  const definition = getMasterDefinition(moduleKey);
  const delegate = delegates[moduleKey];
  if (!definition || !delegate) return [];
  const search = options.search?.trim();
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 500);
  const selectedColumns = new Set([
    "id",
    "value_id",
    "organization_id",
    "is_active",
    "sort_order",
    ...(masterModulesWithoutLegacyMetadata.has(moduleKey) ? [] : ["legacy_metadata"]),
    labelFields[moduleKey],
    parentColumns[moduleKey],
  ]);
  for (const field of definition.fields) {
    const column = fieldColumns[moduleKey]?.[field.key];
    if (column && !column.startsWith("legacy_metadata.")) selectedColumns.add(column);
  }
  const dummyBatchQuery = Object.prototype.hasOwnProperty.call(options, "activeDummyDataBatch")
    ? Promise.resolve(options.activeDummyDataBatch)
    : prisma.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      });
  const [dummyBatch, fetchedRows] = await Promise.all([
    dummyBatchQuery,
    delegate.findMany({
      where: {
        organization_id: organizationId,
        ...(moduleKey === "article" && options.articleCode ? { article_code: options.articleCode } : {}),
        ...(moduleKey === "location" && options.entityId ? { entity_id: options.entityId } : {}),
        ...(includeInactive ? {} : { is_active: true }),
        ...(search && labelFields[moduleKey]
          ? options.exactSearch
            ? {
                OR: [
                  { [labelFields[moduleKey]]: { equals: search, mode: "insensitive" } },
                  { id: search },
                  { value_id: search },
                ],
              }
            : { [labelFields[moduleKey]]: { contains: search, mode: "insensitive" } }
          : {}),
      },
      orderBy: [{ sort_order: "asc" }, { [labelFields[moduleKey]]: "asc" }],
      select: Object.fromEntries([...selectedColumns].filter(Boolean).map((column) => [column, true])),
      take: limit + (options.includeDummyData ? 0 : 20),
    }),
  ]);
  const rows = fetchedRows
    .filter((row) => options.includeDummyData || !dummyBatch || !belongsToDummyBatch(row, dummyBatch.id))
    .slice(0, limit);
  const additionalRead = options.onRowsFetched?.(rows.map((row) => row.id));
  const lookupFieldsByModuleKey = new Map<string, MasterFieldDefinition[]>();
  const lookupFields = definition.fields.filter((field) => field.type === "lookup");
  for (const field of lookupFields) {
    const lookupModuleKey = field.lookupModuleKey;
    if (!lookupModuleKey) continue;
    const moduleLookupFields = lookupFieldsByModuleKey.get(lookupModuleKey) ?? [];
    moduleLookupFields.push(field);
    lookupFieldsByModuleKey.set(lookupModuleKey, moduleLookupFields);
  }
  const lookupCache = new Map<string, Map<string, string>>();

  const lookupHydration = Promise.all([...lookupFieldsByModuleKey.entries()].map(async ([lookupModuleKey, fieldsForLookup]) => {
    const ids = [...new Set(rows.flatMap((row) => fieldsForLookup
      .map((field) => String(valueForMasterField(row, fieldColumns[moduleKey]?.[field.key] ?? "") ?? ""))
      .filter(Boolean)))];
    if (ids.length === 0) return;
    const lookupLabelField = labelFields[lookupModuleKey];
    const lookupRows = await delegates[lookupModuleKey].findMany({
      where: { organization_id: organizationId, OR: [{ id: { in: ids } }, { value_id: { in: ids } }] },
      select: { id: true, value_id: true, [lookupLabelField]: true },
      take: 500,
    });
    const labels = new Map<string, string>();
    for (const lookupRow of lookupRows) {
      const label = String(lookupRow[lookupLabelField] ?? "");
      labels.set(lookupRow.id, label);
      labels.set(lookupRow.value_id, label);
    }
    lookupCache.set(lookupModuleKey, labels);
  }));

  const articleDetailsPromise = moduleKey === "article"
    && options.includeArticleDetails !== false
    && rows.length > 0
    ? Promise.all([
        prisma.masterArticleVariant.findMany({
          where: {
            organization_id: organizationId,
            article_id: { in: rows.map((row) => row.id) },
            ...(includeInactive ? {} : { is_active: true }),
            color: { organization_id: organizationId, ...(includeInactive ? {} : { is_active: true }) },
          },
          select: {
            id: true,
            article_id: true,
            variant: true,
            variant_code: true,
            sku: true,
            price_override: true,
            color: { select: { organization_id: true, colors: true } },
          },
          orderBy: [{ sort_order: "asc" }, { variant: "asc" }],
        }),
        prisma.masterArticleSize.findMany({
          where: {
            organization_id: organizationId,
            article_id: { in: rows.map((row) => row.id) },
            size: { organization_id: organizationId, ...(includeInactive ? {} : { is_active: true }) },
          },
          select: {
            article_id: true,
            price: true,
            size: { select: { organization_id: true, size: true, is_active: true } },
          },
          orderBy: [{ article_id: "asc" }, { created_at: "asc" }],
        }),
      ])
    : Promise.resolve(null);
  const articleSizeOrderPromise = moduleKey === "article" && rows.length > 0
    ? getSizeGroupSizeOrderMapForOrganization(
        organizationId,
        rows.map((row) => String((row as Record<string, unknown>).size_group_id ?? "")),
      )
    : Promise.resolve(new Map<string, string[]>());
  const [, articleDetails, , articleSizeOrderByReference] = await Promise.all([
    lookupHydration,
    articleDetailsPromise,
    additionalRead ?? Promise.resolve(),
    articleSizeOrderPromise,
  ]);
  const articleVariants = articleDetails?.[0] ?? [];
  const variantsByArticle = new Map<string, typeof articleVariants>();
  for (const variant of articleVariants) {
    if (variant.color.organization_id !== organizationId) continue;
    const articleVariantsForStyle = variantsByArticle.get(variant.article_id) ?? [];
    articleVariantsForStyle.push(variant);
    variantsByArticle.set(variant.article_id, articleVariantsForStyle);
  }
  const articleSizes = articleDetails?.[1] ?? [];
  const sizesByArticle = new Map<string, string[]>();
  const sizePricesByArticle = new Map<string, Array<{ size: string; price: string | null }>>();
  for (const articleSize of articleSizes) {
    if (articleSize.size.organization_id !== organizationId) continue;
    const sizes = sizesByArticle.get(articleSize.article_id) ?? [];
    sizes.push(articleSize.size.size);
    sizesByArticle.set(articleSize.article_id, sizes);
    const prices = sizePricesByArticle.get(articleSize.article_id) ?? [];
    prices.push({ size: articleSize.size.size, price: articleSize.price?.toString() ?? null });
    sizePricesByArticle.set(articleSize.article_id, prices);
  }

  const hydratedRows = rows.map((row) => {
    const fields = rowFields(moduleKey, row, definition, options.includeArticleMetrics);
    for (const field of lookupFields) {
      const related = fields[field.key] && field.lookupModuleKey
        ? lookupCache.get(field.lookupModuleKey)?.get(String(fields[field.key]))
        : null;
      fields[field.key] = related ?? fields[field.key] ?? null;
    }
    if (moduleKey === "article") {
      const sizeGroupReference = String((row as Record<string, unknown>).size_group_id ?? "");
      const orderedSizes = articleSizeOrderByReference.get(sizeGroupReference.trim().toLocaleLowerCase()) ?? [];
      fields.variants = (variantsByArticle.get(row.id) ?? []).map((variant) => ({
        id: variant.id,
        variant: variant.variant,
        color: variant.color.colors,
        variant_code: variant.variant_code,
        sku: variant.sku,
        price_override: variant.price_override?.toString() ?? null,
      }));
      fields.Sizes = sortBySizeGroupOrder(sizesByArticle.get(row.id) ?? [], orderedSizes, (size) => size);
      fields.Size_Prices = sortBySizeGroupOrder(
        sizePricesByArticle.get(row.id) ?? [],
        orderedSizes,
        (entry) => entry.size,
      );
    }
    return {
      id: row.id,
      value_id: row.value_id,
      label: String(row[labelFields[moduleKey]] ?? ""),
      code: ["article", "gold-seal"].includes(moduleKey)
        ? String((row as Record<string, unknown>)[moduleKey === "article" ? "article_code" : "gold_seal_code"] ?? "") || null
        : null,
      description: null,
      is_active: row.is_active,
      is_dummy: Boolean(dummyBatch && belongsToDummyBatch(row, dummyBatch.id)),
      parent_id: parentColumns[moduleKey] ? (row[parentColumns[moduleKey]] as string | null) ?? null : null,
      fields,
    };
  });

  return hydratedRows;
}

export async function getActiveOrganizationDummyDataBatch(organizationId: string) {
  return prisma.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });
}

export async function getPendingMasterValuesForOrganization(organizationId: string, moduleKey: string) {
  return (await getMasterValuesForOrganization(organizationId, moduleKey, true)).filter((entry) => !entry.is_active);
}

export async function assertNoDummyMasterReferences(
  organizationId: string,
  references: Record<string, unknown>,
) {
  const batch = await prisma.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { master_record_ids: true },
  });
  if (!batch || !Array.isArray(batch.master_record_ids)) return;

  const dummyIdsByModule = new Map<string, string[]>();
  for (const item of batch.master_record_ids) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.moduleKey !== "string" || typeof record.id !== "string") continue;
    const ids = dummyIdsByModule.get(record.moduleKey) ?? [];
    ids.push(record.id);
    dummyIdsByModule.set(record.moduleKey, ids);
  }

  const fieldModules: Record<string, string> = {
    category: "category",
    subCategory: "sub-category",
    season: "season",
    article: "article",
    buyer: "buyer",
    brand: "brand",
    sizeGroup: "size-group",
  };
  const submittedSizes = Array.isArray(references.rows)
    ? references.rows.flatMap((row) => typeof row === "object" && row !== null
      ? [String((row as Record<string, unknown>).size ?? (row as Record<string, unknown>).buyerSize ?? "").trim()]
      : []).filter(Boolean)
    : [];
  const selections = [
    ...Object.entries(fieldModules).map(([field, moduleKey]) => ({
      moduleKey,
      values: [String(references[field] ?? "").trim()].filter(Boolean),
    })),
    {
      moduleKey: "color",
      values: String(references.colors ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    },
    { moduleKey: "size", values: submittedSizes },
  ].filter(({ values }) => values.length > 0);

  for (const { moduleKey, values } of selections) {
    const dummyIds = dummyIdsByModule.get(moduleKey) ?? [];
    if (dummyIds.length === 0) continue;
    const rows = await delegates[moduleKey].findMany({
      where: { organization_id: organizationId, id: { in: dummyIds } },
      select: { [labelFields[moduleKey]]: true },
    });
    const dummyLabels = new Set(rows.map((row) =>
      String(row[labelFields[moduleKey]] ?? "").trim().toLocaleLowerCase(),
    ));
    if (values.some((value) => dummyLabels.has(value.toLocaleLowerCase()))) {
      throw new Error("Dummy master values cannot be used by regular organization orders.");
    }
  }
}

export async function getSizeGroupSizesForOrganization(
  organizationId: string,
  sizeGroupIds?: string[],
  includeDummyData = false,
  activeDummyDataBatch?: { id: string } | null | Promise<{ id: string } | null>,
) {
  if (sizeGroupIds && sizeGroupIds.length === 0) return [];

  const [dummyBatch, links] = await Promise.all([
    includeDummyData
      ? Promise.resolve(null)
      : activeDummyDataBatch !== undefined
        ? Promise.resolve(activeDummyDataBatch)
        : prisma.organizationDummyDataBatch.findFirst({
            where: { organization_id: organizationId, status: "ACTIVE" },
            select: { id: true },
          }),
    prisma.masterSizeGroupSize.findMany({
      where: {
        organization_id: organizationId,
        ...(sizeGroupIds ? { size_group_id: { in: sizeGroupIds } } : {}),
      },
      select: {
        size_group_id: true,
        size: {
          select: {
            id: true,
            value_id: true,
            organization_id: true,
            size: true,
            is_active: true,
            status: true,
            legacy_metadata: true,
          },
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
  ]);
  const dummyGroups = dummyBatch && !includeDummyData
    ? await prisma.masterSizeGroup.findMany({
        where: { organization_id: organizationId, ...(sizeGroupIds ? { id: { in: sizeGroupIds } } : {}) },
        select: { id: true, legacy_metadata: true },
      })
    : [];
  const dummyGroupIds = new Set(dummyGroups.filter((group) => belongsToDummyBatch(group, dummyBatch!.id)).map((group) => group.id));

  return links.filter((link) => link.size.organization_id === organizationId && (includeDummyData || !dummyBatch
    || (!dummyGroupIds.has(link.size_group_id) && !belongsToDummyBatch(link.size, dummyBatch.id)))).map((link) => ({
    groupId: link.size_group_id,
    size: {
      id: link.size.id,
      value_id: link.size.value_id,
      label: link.size.size,
      is_active: link.size.is_active,
      parent_id: link.size_group_id,
      fields: { Size: link.size.size, status: link.size.status },
    },
  }));
}

export async function getSizeGroupSizeOrderMapForOrganization(
  organizationId: string,
  groupReferences: string[],
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const references = [...new Set(groupReferences.map((value) => value.trim()).filter(Boolean))];
  if (references.length === 0) return new Map<string, string[]>();

  const groups = await database.masterSizeGroup.findMany({
    where: {
      organization_id: organizationId,
      OR: [
        { id: { in: references } },
        { value_id: { in: references } },
        { size_group: { in: references } },
      ],
    },
    select: {
      id: true,
      value_id: true,
      size_group: true,
      size_links: {
        where: { organization_id: organizationId },
        select: {
          size_group_id: true,
          size: { select: { organization_id: true, size: true } },
        },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      },
    },
  });
  const labelsByGroupId = new Map<string, string[]>();
  for (const group of groups) {
    const labels = group.size_links
      .filter((link) => link.size.organization_id === organizationId)
      .map((link) => link.size.size);
    labelsByGroupId.set(group.id, labels);
  }

  const orderByReference = new Map<string, string[]>();
  for (const group of groups) {
    const labels = labelsByGroupId.get(group.id) ?? [];
    for (const reference of [group.id, group.value_id, group.size_group]) {
      if (reference) orderByReference.set(reference.trim().toLocaleLowerCase(), labels);
    }
  }
  return orderByReference;
}

export function sortBySizeGroupOrder<T>(
  values: readonly T[],
  orderedSizes: readonly string[],
  getSize: (value: T) => string | null | undefined,
) {
  const rankBySize = new Map(orderedSizes.map((size, index) => [size.trim().toLocaleLowerCase(), index]));
  return values
    .map((value, originalIndex) => ({ value, originalIndex }))
    .sort((first, second) => {
      const firstRank = rankBySize.get(String(getSize(first.value) ?? "").trim().toLocaleLowerCase());
      const secondRank = rankBySize.get(String(getSize(second.value) ?? "").trim().toLocaleLowerCase());
      return (firstRank ?? Number.MAX_SAFE_INTEGER) - (secondRank ?? Number.MAX_SAFE_INTEGER)
        || first.originalIndex - second.originalIndex;
    })
    .map(({ value }) => value);
}

export async function syncSizeGroupSizes(organizationId: string, sizeGroupId: string, selectedValues: unknown[]) {
  const selectedLabels = [...new Set(selectedValues.map((value) => String(value).trim()).filter(Boolean))];
  const sizes = await prisma.masterSize.findMany({
    where: {
      organization_id: organizationId,
      OR: selectedLabels.flatMap((label) => [{ id: label }, { value_id: label }, { size: label }]),
    },
  });
  const dummyBatch = await prisma.organizationDummyDataBatch.findFirst({
    where: { organization_id: organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  const selectableSizes = dummyBatch
    ? sizes.filter((size) => !belongsToDummyBatch(size, dummyBatch.id))
    : sizes;
  const sizeByKey = new Map(selectableSizes.flatMap((size) => [[size.id, size], [size.value_id, size], [size.size, size]]));
  const selectedSizes = selectedLabels.map((label) => sizeByKey.get(label)).filter((size): size is (typeof sizes)[number] => Boolean(size));

  if (selectedSizes.length !== selectedLabels.length) {
    throw new Error("Every selected size must already exist in the Size master.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.masterSizeGroupSize.deleteMany({
      where: { organization_id: organizationId, size_group_id: sizeGroupId },
    });
    if (selectedSizes.length > 0) {
      const createdAt = new Date();
      await transaction.masterSizeGroupSize.createMany({
        data: selectedSizes.map((size, index) => ({
          organization_id: organizationId,
          size_group_id: sizeGroupId,
          size_id: size.id,
          created_at: new Date(createdAt.getTime() + index),
        })),
      });
    }
  });
}

export async function createMasterValueForOrganization(
  organizationId: string,
  moduleKey: string,
  input: { label: string; code?: string | null; description?: string | null; fields?: MasterFieldValues; childRows?: Record<string, Record<string, unknown>[]>; parentValueId?: string | null; createOnly?: boolean; articleVariants?: FinishedGoodsVariantInput[]; articleSizes?: string[]; articleSizePrices?: FinishedGoodsSizePriceInput[]; sizeGroupId?: string; lookupIndex?: ActiveMasterLookupIndex },
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const definition = getMasterDefinition(moduleKey);
  const delegate = delegates[moduleKey];
  if (!definition || !delegate) throw new Error("Master module is not available.");

  const createWithinTransaction = async (transaction: Prisma.TransactionClient) => {
    const transactionDelegateName = moduleKey === "product-master"
      ? "masterProduct"
      : moduleKey === "process-master"
        ? "masterProcess"
      : `master${moduleKey.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`;
    const transactionDelegate =
      (transaction as unknown as Record<string, MasterDelegate>)[transactionDelegateName] ?? delegate;

    const data = await buildData(
      organizationId,
      moduleKey,
      input.fields ?? {},
      input.label.trim(),
      undefined,
      input.lookupIndex,
      transaction,
    );
    let selectedSizeIds: string[] = [];
    let selectedSizeLabels = new Set<string>();
    if (moduleKey === "size-group" && Array.isArray(input.fields?.Size)) {
      const selectedLabels = [...new Set(input.fields.Size.map((value) => String(value).trim()).filter(Boolean))];
      const sizes = await transaction.masterSize.findMany({
        where: {
          organization_id: organizationId,
          is_active: true,
          OR: selectedLabels.flatMap((value) => [{ id: value }, { value_id: value }, { size: value }]),
        },
      });
      const dummyBatch = await transaction.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      const selectableSizes = dummyBatch
        ? sizes.filter((size) => !belongsToDummyBatch(size, dummyBatch.id))
        : sizes;
      const sizesByValue = new Map(selectableSizes.flatMap((size) => [
        [size.id, size],
        [size.value_id, size],
        [size.size, size],
      ]));
      const selectedSizes = selectedLabels.map((value) => sizesByValue.get(value))
        .filter((size): size is (typeof sizes)[number] => Boolean(size));
      if (selectedSizes.length !== selectedLabels.length) {
        throw new Error("Every selected size must be active and belong to this organization.");
      }
      selectedSizeIds = selectedSizes.map((size) => size.id);
      selectedSizeLabels = new Set(selectedSizes.map((size) => size.size.trim().toLocaleLowerCase()));
    }
    const sizeGroup = moduleKey === "size" && input.sizeGroupId
      ? await transaction.masterSizeGroup.findFirst({
          where: {
            organization_id: organizationId,
            OR: [{ id: input.sizeGroupId }, { value_id: input.sizeGroupId }],
            is_active: true,
          },
          select: { id: true },
        })
      : null;
    if (moduleKey === "size" && input.sizeGroupId && !sizeGroup) {
      throw new Error("Select an active Size Group belonging to this organization.");
    }

    if (moduleKey === "location") {
      await enforceInventoryLocationLimit(transaction, organizationId, input.label.trim());
    }

    if (moduleKey === "article" || moduleKey === "gold-seal") {
      const codeField = moduleKey === "article" ? "article_code" : "gold_seal_code";
      const providedCode = String((input.fields?.[codeField] ?? data[codeField] ?? "") ?? "").trim();
      data[codeField] = providedCode || (moduleKey === "article"
        ? await nextArticleCode(organizationId, transactionDelegate)
        : await nextGoldSealCode(organizationId, transactionDelegate));
      const articleCodeExists = await transactionDelegate.findFirst({
        where: { organization_id: organizationId, [codeField]: data[codeField] },
      });
      if (articleCodeExists) {
        throw new Error(`This ${moduleKey === "article" ? "article" : "Gold Seal"} code is already in use.`);
      }
    }

    if (input.parentValueId && parentColumns[moduleKey]) {
      const parentModuleKey = moduleKey === "gold-seal-variant"
        ? "gold-seal"
        : moduleKey === "process-template-step"
        ? "process-template"
        : moduleKey === "operation-template-step"
          ? "operation-template"
        : moduleKey === "stock-uom-convert"
          ? "uom"
        : definition.fields.find((field) => field.type === "lookup")?.lookupModuleKey
        ?? (moduleKey === "sub-category" ? "category" : moduleKey === "size" ? "size-group" : "");
      if (parentModuleKey) {
        const parentId = await resolveLookupId(organizationId, parentModuleKey, input.parentValueId, transaction);
        if (parentId) {
          data[parentColumns[moduleKey]] = parentId;
        }
      }
    }

    data.is_active = true;
    data.sort_order = await transactionDelegate.count({ where: { organization_id: organizationId } });

    const labelKey = labelFields[moduleKey];
    let created: MasterRow;

    const parentColumn = parentColumns[moduleKey];
    const parentId = parentColumn ? data[parentColumn] : undefined;
    const existing = labelKey
      ? await transactionDelegate.findFirst({
          where: {
            organization_id: organizationId,
            [labelKey]: data[labelKey],
            ...(parentColumn && parentId ? { [parentColumn]: parentId } : {}),
          },
        })
      : null;

    if (existing && input.createOnly) {
      throw new Error(`${definition.label} "${input.label.trim()}" already exists. Refresh the uploaded file and try again.`);
    }

    if (moduleKey === "size-group" && !existing && selectedSizeIds.length > 0) {
      const brandId = data.brand_id;
      if (typeof brandId !== "string" || !brandId) {
        throw new Error("Select a Brand before creating a Size Group.");
      }
      const existingGroups = await transaction.masterSizeGroup.findMany({
        where: { organization_id: organizationId, brand_id: brandId },
        select: { id: true },
      });
      if (existingGroups.length > 0) {
        const links = await transaction.masterSizeGroupSize.findMany({
          where: {
            organization_id: organizationId,
            size_group_id: { in: existingGroups.map((group) => group.id) },
          },
          select: {
            size_group_id: true,
            size: { select: { organization_id: true, size: true } },
          },
        });
        const sizesByGroup = new Map<string, Set<string>>();
        for (const link of links) {
          if (link.size.organization_id !== organizationId) continue;
          const groupSizes = sizesByGroup.get(link.size_group_id) ?? new Set<string>();
          groupSizes.add(link.size.size.trim().toLocaleLowerCase());
          sizesByGroup.set(link.size_group_id, groupSizes);
        }
        const duplicateGroup = existingGroups.find((group) => {
          const groupSizes = sizesByGroup.get(group.id) ?? new Set<string>();
          return groupSizes.size === selectedSizeLabels.size
            && [...selectedSizeLabels].every((size) => groupSizes.has(size));
        });
        if (duplicateGroup) {
          throw new Error(
            "This Brand already has a Size Group with exactly these sizes. Reuse that group; only a different size set can be created.",
          );
        }
      }
    }

    if (existing) {
      created = await transactionDelegate.update({
        where: { id: existing.id },
        data,
      });
    } else {
      created = await transactionDelegate.create({ data });
    }
    if (sizeGroup) {
      const existingSizeGroupLink = await transaction.masterSizeGroupSize.findFirst({
        where: {
          organization_id: organizationId,
          size_group_id: sizeGroup.id,
          size_id: created.id,
        },
        select: { id: true },
      });
      if (!existingSizeGroupLink) {
        await transaction.masterSizeGroupSize.create({
          data: {
            organization_id: organizationId,
            size_group_id: sizeGroup.id,
            size_id: created.id,
          },
        });
      }
    }

    if (moduleKey === "article" && "articleVariants" in input && input.articleVariants) {
      await syncFinishedGoodsVariants(transaction, organizationId, created.id, input.articleVariants);
    }
    if (moduleKey !== "article" && input.childRows) {
      for (const field of definition.fields.filter((candidate) => candidate.type === "child-list")) {
        const childModuleKey = field.childModuleKey;
        if (!childModuleKey) throw new Error(`${field.label} child module is not configured.`);
        for (const childFields of input.childRows[field.key] ?? []) {
          const childDefinition = getMasterDefinition(childModuleKey);
          const childLabelField = childDefinition?.labelField
            ?? childDefinition?.fields.find((childField) => childField.type === "lookup")?.key
            ?? childDefinition?.fields.find((childField) => !childField.readOnly)?.key;
          const childLabel = childLabelField ? childFields[childLabelField] : null;
          if (typeof childLabel !== "string" || !childLabel.trim()) {
            throw new Error(`${field.label} contains an incomplete child row.`);
          }
          await createMasterValueForOrganization(organizationId, childModuleKey, {
            label: childLabel,
            fields: childFields as MasterFieldValues,
            parentValueId: created.id,
            createOnly: true,
            lookupIndex: input.lookupIndex,
          }, transaction);
        }
      }
    }
    if (moduleKey === "article" && input.articleSizes) {
      await syncFinishedGoodsSizes(
        transaction,
        organizationId,
        created.id,
        typeof created.size_group_id === "string" ? created.size_group_id : null,
        input.articleSizes,
        input.articleSizePrices,
      );
    }
    if (moduleKey === "size-group" && selectedSizeIds.length > 0) {
      await transaction.masterSizeGroupSize.createMany({
        data: selectedSizeIds.map((sizeId) => ({
          organization_id: organizationId,
          size_group_id: created.id,
          size_id: sizeId,
        })),
      });
    }

    if (!input.createOnly) {
      await transaction.approvalRequest.deleteMany({
        where: { organization_id: organizationId, entity_ref_id: created.value_id },
      });
    }
    await transaction.approvalRequest.create({
      data: {
        organization_id: organizationId,
        module_key: moduleKey,
        module_name: definition.label,
        entity_type: "master",
        entity_key: moduleKey,
        entity_label: input.label.trim(),
        entity_ref_id: created.value_id,
        status: "pending",
        notes: `Master value pending approval for ${definition.label}.`,
      },
    });

    return created;
  };

  if ("$transaction" in database) {
    return database.$transaction(createWithinTransaction, {
      maxWait: 10_000,
      timeout: 30_000,
    });
  }
  return createWithinTransaction(database);
}

export async function updateMasterValue(organizationId: string, valueId: string, input: { label?: string; code?: string | null; description?: string | null; fields?: MasterFieldValues; is_active?: boolean; articleVariants?: FinishedGoodsVariantInput[]; articleSizes?: string[]; articleSizePrices?: FinishedGoodsSizePriceInput[] }) {
  for (const [moduleKey, delegate] of Object.entries(delegates)) {
    const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: valueId }, { value_id: valueId }] } });
    if (existing) {
      if (await isActiveDummyMaster(organizationId, existing)) {
        throw new Error("Demo master values are managed by the Dummy Data batch and cannot be edited individually.");
      }
      if (moduleKey === "article" && (input.articleVariants || input.articleSizes || input.articleSizePrices)) {
        const articleVariants = input.articleVariants;
        const articleSizes = input.articleSizes;
        const articleSizePrices = input.articleSizePrices;
        return prisma.$transaction(async (transaction) => {
          const currentArticle = await transaction.masterArticle.findFirst({
            where: { organization_id: organizationId, id: existing.id },
          });
          if (!currentArticle) return null;
          const data = input.fields
            ? await buildData(
                organizationId,
                moduleKey,
                input.fields,
                input.label?.trim() || String(existing[labelFields[moduleKey]]),
                existing.legacy_metadata,
              )
            : {};
          delete data.organization_id;
          if (input.is_active !== undefined) data.is_active = input.is_active;
          const updated = await transaction.masterArticle.update({ where: { id: existing.id }, data });
          if (articleVariants) {
            await syncFinishedGoodsVariants(transaction, organizationId, existing.id, articleVariants);
          }
          if (articleSizes) {
            await syncFinishedGoodsSizes(
              transaction,
              organizationId,
              existing.id,
              typeof updated.size_group_id === "string" ? updated.size_group_id : null,
              articleSizes,
              articleSizePrices,
            );
          }
          return updated;
        }, { timeout: 15_000 });
      }
      const data = input.fields
        ? await buildData(
            organizationId,
            moduleKey,
            input.fields,
            input.label?.trim() || String(existing[labelFields[moduleKey]]),
            existing.legacy_metadata,
          )
        : {};
      delete data.organization_id;
      if (input.is_active !== undefined) data.is_active = input.is_active;
      return delegate.update({ where: { id: existing.id }, data });
    }
  }
  return null;
}

export async function deleteMasterValue(organizationId: string, valueId: string) {
  for (const [moduleKey, delegate] of Object.entries(delegates)) {
    const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: valueId }, { value_id: valueId }] } });
    if (existing) {
      if (await isActiveDummyMaster(organizationId, existing)) {
        return { record: null, error: "Demo master values can only be removed by deleting the complete Dummy Data batch." };
      }
      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.approvalRequest.deleteMany({ where: { organization_id: organizationId, entity_ref_id: existing.value_id } });
          await delegate.delete({ where: { id: existing.id } });
        });
        return { record: existing };
      } catch (error) {
        const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isForeignKeyConflict = errorCode === "P2003"
          || errorMessage.includes("violates foreign key constraint")
          || errorMessage.includes("violates RESTRICT setting of foreign key constraint");

        if (isForeignKeyConflict) {
          return {
            record: null,
            error: `This ${getMasterDefinition(moduleKey)?.label.toLowerCase() ?? "master value"} cannot be deleted because it is used by other records.`,
          };
        }

        throw error;
      }
    }
  }
  return { record: null };
}

export async function deleteSelectedArticlesForOrganization(
  organizationId: string,
  userId: string,
  articleIds: string[],
) {
  if (!organizationId || !userId || articleIds.length === 0 || articleIds.length > 1000
    || new Set(articleIds).size !== articleIds.length
    || articleIds.some((id) => !id || id.length > 128)) {
    return { deletedCount: 0, error: "Select valid Article records and try again." };
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const records = await transaction.masterArticle.findMany({
        where: { organization_id: organizationId, id: { in: articleIds } },
        select: { id: true, value_id: true, legacy_metadata: true },
      });
      if (records.length !== articleIds.length) {
        return { deletedCount: 0, error: "One or more selected Articles are no longer available. Refresh and try again." };
      }

      const batch = await transaction.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (batch && records.some((record) => belongsToDummyBatch(record, batch.id))) {
        return { deletedCount: 0, error: "Demo Articles can only be removed by deleting the complete Dummy Data batch." };
      }

      await transaction.approvalRequest.deleteMany({
        where: {
          organization_id: organizationId,
          entity_ref_id: { in: records.map((record) => record.value_id) },
        },
      });
      const deleted = await transaction.masterArticle.deleteMany({
        where: { organization_id: organizationId, id: { in: articleIds } },
      });
      if (deleted.count !== articleIds.length) {
        throw new Error("The selected Articles changed while they were being deleted. Refresh and try again.");
      }

      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "master-data",
          action: "DELETE_SELECTED",
          entity_type: "article",
          details: { articleIds, deletedCount: deleted.count },
        },
      });
      return { deletedCount: deleted.count };
    });
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorCode === "P2003" ||
      errorMessage.includes("violates foreign key constraint") ||
      errorMessage.includes("violates RESTRICT setting of foreign key constraint")
    ) {
      return {
        deletedCount: 0,
        error: "One or more selected Articles are used by other records. Remove those dependencies before deleting them.",
      };
    }
    throw error;
  }
}

export async function deleteSelectedMasterValuesForOrganization(
  organizationId: string,
  userId: string,
  moduleKey: string,
  recordIds: string[],
) {
  const definition = getMasterDefinition(moduleKey);
  const delegateName = moduleKey === "product-master"
    ? "masterProduct"
    : moduleKey === "process-master"
      ? "masterProcess"
      : `master${moduleKey.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`;
  if (!organizationId || !userId || !definition || definition.hidden
    || !delegates[moduleKey] || recordIds.length === 0 || recordIds.length > 1_000
    || new Set(recordIds).size !== recordIds.length
    || recordIds.some((id) => !id || id.length > 128)) {
    return { deletedCount: 0, error: `Select valid ${definition?.label ?? "master"} records and try again.` };
  }
  const displayLabel = definition.label;

  try {
    return await prisma.$transaction(async (transaction) => {
      const transactionDelegates = transaction as unknown as Record<string, MasterDelegate>;
      const delegate = transactionDelegates[delegateName];
      if (!delegate) {
        return { deletedCount: 0, error: `Bulk deletion is not configured for ${displayLabel}.` };
      }
      const records = await delegate.findMany({
        where: { organization_id: organizationId, id: { in: recordIds } },
        select: { id: true, value_id: true, legacy_metadata: true },
      });
      if (records.length !== recordIds.length) {
        return {
          deletedCount: 0,
          error: `One or more selected ${displayLabel} records are no longer available. Refresh and try again.`,
        };
      }

      const batch = await transaction.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (batch && records.some((record) => belongsToDummyBatch(record, batch.id))) {
        return {
          deletedCount: 0,
          error: "Demo master values can only be removed by deleting the complete Dummy Data batch.",
        };
      }

      if (moduleKey === "size-group") {
        const linkedArticle = await transaction.masterArticle.findFirst({
          where: {
            organization_id: organizationId,
            size_group_id: { in: recordIds },
          },
          select: { id: true },
        });
        if (linkedArticle) {
          return {
            deletedCount: 0,
            error: "One or more selected Size Groups are linked to Articles. Reassign those Articles before deleting the Size Groups.",
          };
        }
      }

      await transaction.approvalRequest.deleteMany({
        where: {
          organization_id: organizationId,
          entity_ref_id: { in: records.map((record) => record.value_id) },
        },
      });
      const deleted = await delegate.deleteMany({
        where: { organization_id: organizationId, id: { in: recordIds } },
      });
      if (deleted.count !== recordIds.length) {
        throw new Error(`The selected ${displayLabel} records changed while being deleted. Refresh and try again.`);
      }
      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "master-data",
          action: "DELETE_SELECTED",
          entity_type: moduleKey,
          details: {
            recordIds,
            ...(moduleKey === "article" ? { articleIds: recordIds } : {}),
            moduleKey,
            deletedCount: deleted.count,
          },
        },
      });
      return { deletedCount: deleted.count };
    });
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorCode === "P2003"
      || errorMessage.includes("violates foreign key constraint")
      || errorMessage.includes("violates RESTRICT setting of foreign key constraint")
    ) {
      return {
        deletedCount: 0,
        error: moduleKey === "size-group"
          ? "One or more selected Size Groups are linked to Articles or other records. Reassign or remove those dependencies before deleting the Size Groups."
          : `One or more selected ${displayLabel} records are used by other records. Remove those dependencies before deleting them.`,
      };
    }
    throw error;
  }
}

export async function deleteAllMasterValuesForOrganization(
  organizationId: string,
  userId: string,
  moduleKey: string,
) {
  const delegateName = transactionDelegateNames[moduleKey];
  if (!organizationId || !userId || !delegateName || !isMasterSectionBulkDeletable(moduleKey)) {
    throw new Error("This master section is not available for bulk deletion.");
  }
  const label = getMasterDefinition(moduleKey)?.label.toLowerCase() ?? "master";

  try {
    return await prisma.$transaction(async (transaction) => {
      const transactionDelegates = transaction as unknown as Record<string, MasterDelegate>;
      const delegate = transactionDelegates[delegateName];
      if (!delegate) throw new Error("Bulk deletion is not configured for this master section.");
      const records = await delegate.findMany({
        where: { organization_id: organizationId },
        select: { id: true, value_id: true, legacy_metadata: true },
      });
      if (records.length === 0) return { deletedCount: 0 };

      const batch = await transaction.organizationDummyDataBatch.findFirst({
        where: { organization_id: organizationId, status: "ACTIVE" },
        select: { id: true },
      });
      if (batch && records.some((record) => belongsToDummyBatch(record, batch.id))) {
        throw new Error("Demo master values can only be removed by deleting the complete Dummy Data batch.");
      }

      await transaction.approvalRequest.deleteMany({
        where: {
          organization_id: organizationId,
          entity_ref_id: { in: records.map((record) => record.value_id) },
        },
      });
      const result = await delegate.deleteMany({
        where: { organization_id: organizationId, id: { in: records.map((record) => record.id) } },
      });
      if (result.count !== records.length) {
        throw new Error("The master section changed while it was being deleted. Refresh and try again.");
      }
      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "master-data",
          action: "DELETE_ALL",
          entity_type: moduleKey,
          details: { moduleKey, deletedCount: result.count },
        },
      });
      return { deletedCount: result.count };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Demo master values")
    ) {
      throw error;
    }
    const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorCode === "P2003" ||
      errorMessage.includes("violates foreign key constraint") ||
      errorMessage.includes("violates RESTRICT setting of foreign key constraint")
    ) {
      throw new Error(`The ${label} values are in use by other records. Remove those dependencies before deleting this section.`);
    }
    throw error;
  }
}

export async function listApprovalRequestsForOrganization(organizationId: string) {
  return prisma.approvalRequest.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
  });
}

export async function updateApprovalRequestStatus(
  organizationId: string,
  requestId: string,
  status: "approved" | "rejected",
  reviewer?: string | null,
) {
  const request = await prisma.approvalRequest.findFirst({
    where: { organization_id: organizationId, OR: [{ id: requestId }, { request_id: requestId }] },
  });

  if (!request) return null;

  const updated = await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status, reviewed_by: reviewer ?? null, reviewed_at: new Date() },
  });

  if (request.entity_type === "purchase-order" && request.entity_ref_id) {
    await prisma.purchaseOrder.updateMany({
      where: { id: request.entity_ref_id, organization_id: organizationId, status: "PENDING_APPROVAL" },
      data: { status: status === "approved" ? "APPROVED" : "REJECTED", approved_by: reviewer ?? null, approved_at: new Date(), rejection_reason: status === "rejected" ? "Purchase Order approval was rejected." : null },
    });
    return updated;
  }

  if (request.entity_ref_id) {
    const delegate = delegates[request.module_key];
    if (delegate) {
      const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: request.entity_ref_id }, { value_id: request.entity_ref_id }] } });
      if (existing) {
        await delegate.update({ where: { id: existing.id }, data: { is_active: status === "approved" } });
      }
    }
  }

  return updated;
}
