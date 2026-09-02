import { prisma } from "@/lib/database/prisma-client";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-definitions";
export { getMasterDefinition, MASTER_DEFINITIONS } from "@/lib/master-data/master-data-definitions";

export type MasterFieldValues = Record<string, string | number | boolean | null>;

type MasterRow = { id: string; value_id: string; organization_id: string; is_active: boolean; sort_order: number; [key: string]: unknown };
type MasterQuery = Record<string, unknown>;
type MasterDelegate = {
  findMany(args: MasterQuery): Promise<MasterRow[]>;
  findFirst(args: MasterQuery): Promise<MasterRow | null>;
  create(args: MasterQuery): Promise<MasterRow>;
  update(args: MasterQuery): Promise<MasterRow>;
  delete(args: MasterQuery): Promise<MasterRow>;
  count(args: MasterQuery): Promise<number>;
};

const delegates = {
  entity: prisma.masterEntity, "category-type": prisma.masterCategoryType, category: prisma.masterCategory, "sub-category": prisma.masterSubCategory,
  brand: prisma.masterBrand, "pre-order-checklist": prisma.masterPreOrderChecklist, "currency-type": prisma.masterCurrencyType, buyer: prisma.masterBuyer,
  season: prisma.masterSeason, article: prisma.masterArticle, color: prisma.masterColor, "size-group": prisma.masterSizeGroup, size: prisma.masterSize,
  uom: prisma.masterUom, "raw-material": prisma.masterRawMaterial, vendor: prisma.masterVendor, "gst-type": prisma.masterGstType, gst: prisma.masterGst,
  hsn: prisma.masterHsn, "measurement-chart": prisma.masterMeasurementChart, "size-wise-consumption": prisma.masterSizeWiseConsumption,
  "product-master": prisma.masterProduct, "process-template": prisma.masterProcessTemplate, merchandiser: prisma.masterMerchandiser, status: prisma.masterStatus,
  "order-volume": prisma.masterOrderVolume,
  "raw-material-type": prisma.masterRawMaterialType, "raw-material-category": prisma.masterRawMaterialCategory, "raw-material-sub-category": prisma.masterRawMaterialSubCategory,
} as unknown as Record<string, MasterDelegate>;

const labelFields: Record<string, string> = {
  entity: "entity_name", "category-type": "category_type", category: "category_name", "sub-category": "sub_category", brand: "brand",
  "pre-order-checklist": "pre_order_checklist", "currency-type": "currency_type", buyer: "buyer_name", season: "season", article: "article", color: "colors",
  "size-group": "size_group", size: "size", uom: "uom", "raw-material": "raw_material_name", vendor: "vendor", "gst-type": "gst_type", gst: "name",
  hsn: "hsn_code", "measurement-chart": "measurement_chart", "size-wise-consumption": "bom_template_name", "product-master": "product_master_name",
  "process-template": "process_name", merchandiser: "merchandiser", status: "status", "order-volume": "order_volume",
  "raw-material-type": "raw_material_type", "raw-material-category": "raw_material_category", "raw-material-sub-category": "raw_material_sub_category",
};

const fieldColumns: Record<string, Record<string, string>> = {
  entity: { entity_name: "entity_name" },
  "category-type": { Category_Type1: "category_type", Books_Item_ID: "books_item_id" },
  category: { Category_Type_Master: "category_type_id", Category_Name: "category_name", Maximum_Excess_Allowed: "maximum_excess_allowed", Create_Cost_Center: "create_cost_center", Status: "status" },
  "sub-category": { category: "category_id", sub_category: "sub_category" },
  brand: { Brand: "brand", Maximum_Allowed_Excess: "maximum_allowed_excess", Auto_add_Excess_to_RM: "auto_add_excess_to_rm", Pre_Order_Checklist1: "pre_order_checklist_id", Status: "status" },
  buyer: { Buyer_Name: "buyer_name", Currency_Type: "currency_type_id", Status: "status" },
  season: { season: "season" }, article: { article: "article" }, color: { Colors: "colors", Status: "status" },
  "size-group": { Brand1: "brand_id", Size_Group: "size_group", Measurement_Chart1: "measurement_chart_id", Size: "size_id" },
  size: { Size: "size", Size_Group_ID: "size_group_id", status: "status" }, uom: { uom: "uom" }, vendor: { vendor: "vendor" },
  gst: { Name: "name", Gst: "gst", GST_TYPELOOKUP1: "gst_type_id", Zoho_Books_Tax_ID: "zoho_books_tax_id" }, hsn: { Hsn_Code: "hsn_code" },
  "pre-order-checklist": { Pre_Order_Checklist: "pre_order_checklist" }, "currency-type": { Currency_Type: "currency_type" }, "gst-type": { GST_TYPE: "gst_type" },
  "measurement-chart": { Measurement_Chart: "measurement_chart" }, "size-wise-consumption": { Bom_Template_Name: "bom_template_name" },
  "product-master": { Product_Master_name: "product_master_name" }, "process-template": { Process_Name: "process_name" }, merchandiser: { merchandiser: "merchandiser" },
  status: { status: "status" }, "order-volume": { Order_Volume: "order_volume", From: "from_value", To: "to_value" },
  "raw-material-type": { Raw_Material_Type: "raw_material_type" },
  "raw-material-category": { Raw_Material_Type1: "raw_material_type_id", Raw_Material_Category: "raw_material_category" },
  "raw-material-sub-category": { Raw_Material_Category1: "raw_material_category_id", Raw_Material_Sub_Category: "raw_material_sub_category" },
  "raw-material": { Raw_Material_Name: "raw_material_name", Category: "raw_material_category_id", Subcategory: "raw_material_sub_category_id", Stock_Uom1: "stock_uom_id", Category_Type: "raw_material_type_id", Is_this_Specific_for_a_Brand: "is_specific_for_brand", Size_Wise_Concemption: "size_wise_consumption", Size_Wise_Consemption_Master: "size_wise_consumption_id", Brand1: "brand_id", Show_All1: "show_all", Workdrive_Image_ID: "workdrive_image_id", Buyer_Item_Code: "buyer_item_code", Image_Url: "image_url", Item_Code: "item_code", Colour: "colour_id", Create_open_stock: "create_open_stock", Open_Stock: "open_stock", Open_Stock_Price: "open_stock_price", Vendor_Wise_Price_List: "vendor_wise_price_list" },
};

// Maps a moduleKey to the raw FK column that identifies its parent value, enabling cascading dropdowns.
const parentColumns: Record<string, string> = {
  "sub-category": "category_id",
  "raw-material-category": "raw_material_type_id",
  "raw-material-sub-category": "raw_material_category_id",
};

function typedValue(field: MasterFieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "checkbox") return value === true || value === "true" || value === "on";
  if (["number", "percentage", "decimal"].includes(field.type)) return Number(value);
  return String(value);
}

async function resolveLookupId(organizationId: string, moduleKey: string, value: unknown) {
  if (!value) return null;
  const result = await delegates[moduleKey].findFirst({ where: { organization_id: organizationId, OR: [{ id: String(value) }, { value_id: String(value) }, { [labelFields[moduleKey]]: String(value) }] } });
  if (!result) throw new Error(`${getMasterDefinition(moduleKey)?.label ?? moduleKey} lookup value was not found in this organization.`);
  return result.id;
}

async function buildData(organizationId: string, moduleKey: string, fields: MasterFieldValues, label: string) {
  const definition = getMasterDefinition(moduleKey);
  if (!definition) throw new Error("Master module is not available.");
  const data: Record<string, unknown> = { organization_id: organizationId, [labelFields[moduleKey]]: label };
  for (const field of definition.fields) {
    const column = fieldColumns[moduleKey]?.[field.key];
    if (!column || column === labelFields[moduleKey]) continue;
    data[column] = field.type === "lookup" ? await resolveLookupId(organizationId, field.lookupModuleKey ?? "", fields[field.key]) : typedValue(field, fields[field.key]);
  }
  return data;
}

function rowFields(moduleKey: string, row: MasterRow, definition: NonNullable<ReturnType<typeof getMasterDefinition>>) {
  const fields: MasterFieldValues = {};
  for (const field of definition.fields) {
    const column = fieldColumns[moduleKey]?.[field.key];
    if (column) fields[field.key] = (row[column] as MasterFieldValues[string]) ?? null;
  }
  return fields;
}

async function getMasterValueById(organizationId: string, moduleKey: string, value: string) {
  const row = await delegates[moduleKey].findFirst({ where: { organization_id: organizationId, OR: [{ id: value }, { value_id: value }] } });
  return row ? { id: row.id, label: String(row[labelFields[moduleKey]] ?? "") } : null;
}

export async function getMasterValuesForOrganization(organizationId: string, moduleKey: string, includeInactive = false) {
  const definition = getMasterDefinition(moduleKey);
  const delegate = delegates[moduleKey];
  if (!definition || !delegate) return [];
  const rows = await delegate.findMany({ where: { organization_id: organizationId, ...(includeInactive ? {} : { is_active: true }) }, orderBy: [{ sort_order: "asc" }, { [labelFields[moduleKey]]: "asc" }] });
  return Promise.all(rows.map(async (row) => {
    const fields = rowFields(moduleKey, row, definition);
    for (const field of definition.fields.filter((item) => item.type === "lookup")) {
      const related = fields[field.key] ? await getMasterValueById(organizationId, field.lookupModuleKey ?? "", String(fields[field.key])) : null;
      fields[field.key] = related?.label ?? fields[field.key] ?? null;
    }
    return { id: row.id, value_id: row.value_id, label: String(row[labelFields[moduleKey]] ?? ""), code: null, description: null, is_active: row.is_active, parent_id: parentColumns[moduleKey] ? (row[parentColumns[moduleKey]] as string | null) ?? null : null, fields };
  }));
}

export async function getPendingMasterValuesForOrganization(organizationId: string, moduleKey: string) {
  return (await getMasterValuesForOrganization(organizationId, moduleKey, true)).filter((entry) => !entry.is_active);
}

export async function createMasterValueForOrganization(organizationId: string, moduleKey: string, input: { label: string; code?: string | null; description?: string | null; fields?: MasterFieldValues; parentValueId?: string | null }) {
  const definition = getMasterDefinition(moduleKey);
  const delegate = delegates[moduleKey];
  if (!definition || !delegate) throw new Error("Master module is not available.");
  return prisma.$transaction(async (transaction) => {
    const transactionDelegate = (transaction as unknown as Record<string, MasterDelegate>)[`master${moduleKey.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}`];
    const data = await buildData(organizationId, moduleKey, input.fields ?? {}, input.label.trim());
    if (input.parentValueId && moduleKey === "sub-category") data.category_id = await resolveLookupId(organizationId, "category", input.parentValueId);
    data.is_active = false;
    data.sort_order = await delegate.count({ where: { organization_id: organizationId } });
    const created = await transactionDelegate.create({ data });
    await transaction.approvalRequest.create({ data: { organization_id: organizationId, module_key: moduleKey, module_name: definition.label, entity_type: "master", entity_key: moduleKey, entity_label: input.label.trim(), entity_ref_id: created.value_id, status: "pending", notes: `Master value pending approval for ${definition.label}.` } });
    return created;
  });
}

export async function updateMasterValue(organizationId: string, valueId: string, input: { label?: string; code?: string | null; description?: string | null; fields?: MasterFieldValues; is_active?: boolean }) {
  for (const [moduleKey, delegate] of Object.entries(delegates)) {
    const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: valueId }, { value_id: valueId }] } });
    if (existing) {
      const data = input.fields ? await buildData(organizationId, moduleKey, input.fields, input.label?.trim() || String(existing[labelFields[moduleKey]])) : {};
      if (input.is_active !== undefined) data.is_active = input.is_active;
      return delegate.update({ where: { id: existing.id }, data });
    }
  }
  return null;
}

export async function deleteMasterValue(organizationId: string, valueId: string) {
  for (const delegate of Object.values(delegates)) {
    const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: valueId }, { value_id: valueId }] } });
    if (existing) {
      await prisma.$transaction(async (transaction) => {
        await transaction.approvalRequest.deleteMany({ where: { organization_id: organizationId, entity_ref_id: existing.value_id } });
        await delegate.delete({ where: { id: existing.id } });
      });
      return existing;
    }
  }
  return null;
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

  if (!request) {
    return null;
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: request.id },
    data: { status, reviewed_by: reviewer ?? null, reviewed_at: new Date() },
  });

  if (status === "approved" && request.entity_ref_id) {
    const delegate = delegates[request.module_key];
    if (delegate) {
      const existing = await delegate.findFirst({ where: { organization_id: organizationId, OR: [{ id: request.entity_ref_id }, { value_id: request.entity_ref_id }] } });
      if (existing) {
        await delegate.update({ where: { id: existing.id }, data: { is_active: true } });
      }
    }
  }

  return updated;
}

