export type MasterFieldType = "text" | "number" | "percentage" | "decimal" | "url" | "checkbox" | "picklist" | "lookup";

export type MasterFieldDefinition = {
  key: string;
  label: string;
  type: MasterFieldType;
  required?: boolean;
  unique?: boolean;
  options?: string[];
  lookupModuleKey?: string;
  dependsOn?: string;
};

type MasterDefinition = {
  key: string;
  label: string;
  description: string;
  fields: MasterFieldDefinition[];
  labelField?: string;
};

const text = (key: string, label: string, options: Partial<MasterFieldDefinition> = {}): MasterFieldDefinition => ({ key, label, type: "text", ...options });
const lookup = (key: string, label: string, lookupModuleKey: string, options: Partial<MasterFieldDefinition> = {}): MasterFieldDefinition => ({ key, label, type: "lookup", lookupModuleKey, ...options });

export const MASTER_DEFINITIONS: MasterDefinition[] = [
  { key: "entity", label: "Entity", description: "Company and legal entity names.", fields: [text("entity_name", "Entity Name", { required: true, unique: true })] },
  { key: "category", label: "Category", description: "Primary product category master.", labelField: "Category_Name", fields: [lookup("Category_Type_Master", "Category Type Master", "category-type"), text("Category_Name", "Category Name", { required: true, unique: true }), text("Maximum_Excess_Allowed", "Maximum Excess Allowed", { type: "percentage" }), text("Create_Cost_Center", "Create Cost Center", { type: "checkbox" }), text("Status", "Status", { type: "picklist", options: ["Draft", "Approved", "Rejected"] })] },
  { key: "sub-category", label: "Sub Category", description: "Child category values linked to category.", fields: [lookup("category", "Category", "category"), text("sub_category", "Sub Category", { required: true, unique: true })] },
  { key: "brand", label: "Brand", description: "Brand or label master.", labelField: "Brand", fields: [text("Brand", "Brand", { required: true, unique: true }), text("Maximum_Allowed_Excess", "Maximum Allowed Excess", { type: "percentage" }), text("Auto_add_Excess_to_RM", "Auto add Excess to RM", { type: "checkbox" }), lookup("Pre_Order_Checklist1", "Pre Order Checklist", "pre-order-checklist"), text("Status", "Status", { type: "picklist", options: ["Draft", "Approved", "Rejected"] })] },
  { key: "buyer", label: "Buyer", description: "Buyer and customer master.", labelField: "Buyer_Name", fields: [text("Buyer_Name", "Buyer Name", { required: true, unique: true }), lookup("Currency_Type", "Currency Type", "currency-type"), text("Status", "Status", { type: "picklist", options: ["Draft", "Approved", "Rejected"] })] },
  { key: "season", label: "Season", description: "Season and campaign master.", fields: [text("season", "Season", { required: true, unique: true })] },
  { key: "article", label: "Article", description: "Article or style base master.", fields: [text("article", "Article", { required: true, unique: true })] },
  { key: "color", label: "Color", description: "Color and shade master.", labelField: "Colors", fields: [text("Colors", "Colors", { required: true, unique: true }), text("Status", "Status", { type: "picklist", options: ["Draft", "Approved", "Reject"] })] },
  { key: "size-group", label: "Size Group", description: "Grouped size families.", labelField: "Size_Group", fields: [lookup("Brand1", "Brand", "brand", { required: true }), text("Size_Group", "Size Group", { required: true, unique: true }), lookup("Measurement_Chart1", "Measurement Chart", "measurement-chart"), lookup("Size", "Size", "size")] },
  { key: "size", label: "Size", description: "Specific size list and ratios.", fields: [text("Size", "Size", { required: true, unique: true }), lookup("Size_Group_ID", "Size Group", "size-group"), text("status", "Status", { type: "picklist", options: ["Draft", "Approved", "Rejected"] })] },
  { key: "uom", label: "UOM", description: "Unit of measure master.", fields: [text("uom", "UOM", { required: true, unique: true })] },
  { key: "raw-material", label: "Raw Material", description: "Raw material and component master.", labelField: "Raw_Material_Name", fields: [text("Raw_Material_Name", "Raw Material Name", { required: true, unique: true }), lookup("Category", "Raw Material Category", "raw-material-category", { required: true }), lookup("Subcategory", "Raw Material Sub Category", "raw-material-sub-category", { required: true, dependsOn: "Category" }), lookup("Stock_Uom1", "Stock UOM", "uom", { required: true }), lookup("Category_Type", "Raw Material Type", "raw-material-type"), text("Is_this_Specific_for_a_Brand", "Specific for a Brand", { type: "checkbox" }), text("Size_Wise_Concemption", "Size Wise Consumption", { type: "checkbox" }), lookup("Size_Wise_Consemption_Master", "Size Wise Consumption Master", "size-wise-consumption"), lookup("Brand1", "Brand", "brand"), text("Show_All1", "Show All", { type: "checkbox" }), text("Workdrive_Image_ID", "Workdrive Image ID"), text("Buyer_Item_Code", "Buyer Item Code"), text("Image_Url", "Image URL", { type: "url" }), text("Item_Code", "Item Code"), lookup("Colour", "Colour", "color"), text("Create_open_stock", "Create Open Stock", { type: "picklist", options: ["Yes", "No"] }), text("Open_Stock", "Open Stock", { type: "decimal" }), text("Open_Stock_Price", "Open Stock Price", { type: "decimal" }), text("Vendor_Wise_Price_List", "Vendor Wise Price List") ] },
  { key: "raw-material-type", label: "Raw Material Type", description: "Raw material type classification, independent from product category type.", fields: [text("Raw_Material_Type", "Raw Material Type", { required: true, unique: true })] },
  { key: "raw-material-category", label: "Raw Material Category", description: "Raw material category classification, independent from product category.", labelField: "Raw_Material_Category", fields: [lookup("Raw_Material_Type1", "Raw Material Type", "raw-material-type"), text("Raw_Material_Category", "Raw Material Category", { required: true, unique: true })] },
  { key: "raw-material-sub-category", label: "Raw Material Sub Category", description: "Raw material sub category classification, independent from product sub category.", fields: [lookup("Raw_Material_Category1", "Raw Material Category", "raw-material-category", { required: true }), text("Raw_Material_Sub_Category", "Raw Material Sub Category", { required: true, unique: true })] },
  { key: "vendor", label: "Vendor", description: "Supplier and vendor master.", fields: [text("vendor", "Vendor", { required: true, unique: true })] },
  { key: "gst", label: "GST", description: "GST configuration master.", labelField: "Name", fields: [text("Name", "Name", { required: true }), text("Gst", "GST", { type: "percentage" }), lookup("GST_TYPELOOKUP1", "GST Type", "gst-type"), text("Zoho_Books_Tax_ID", "Zoho Books Tax ID") ] },
  { key: "hsn", label: "HSN Code", description: "HSN code and tax mapping.", fields: [text("Hsn_Code", "HSN Code", { required: true })] },
  { key: "category-type", label: "Category Type", description: "Category type lookup values.", fields: [text("Category_Type1", "Category Type", { required: true, unique: true }), text("Books_Item_ID", "Books Item ID")] },
  { key: "measurement-chart", label: "Measurement Chart", description: "Measurement chart lookup values.", fields: [text("Measurement_Chart", "Measurement Chart", { required: true, unique: true })] },
  { key: "size-wise-consumption", label: "Size Wise Consumption", description: "Size wise consumption lookup values.", fields: [text("Bom_Template_Name", "BOM Template Name", { required: true, unique: true })] },
  { key: "pre-order-checklist", label: "Pre Order Checklist", description: "Pre-order checklist lookup values.", fields: [text("Pre_Order_Checklist", "Pre Order Checklist", { required: true, unique: true })] },
  { key: "currency-type", label: "Currency Type", description: "Currency type lookup values.", fields: [text("Currency_Type", "Currency Type", { required: true, unique: true })] },
  { key: "gst-type", label: "GST Type", description: "GST type lookup values.", fields: [text("GST_TYPE", "GST Type", { required: true, unique: true })] },
  { key: "product-master", label: "Product Master", description: "Product master lookup values.", fields: [text("Product_Master_name", "Product Master Name", { required: true, unique: true })] },
  { key: "process-template", label: "Process Template", description: "Production process templates.", fields: [text("Process_Name", "Process Name", { required: true, unique: true })] },
  { key: "merchandiser", label: "Merchandiser", description: "User and merchandiser assignment master.", fields: [text("merchandiser", "Merchandiser", { required: true })] },
  { key: "status", label: "Status", description: "Operational status values.", fields: [text("status", "Status", { required: true })] },
  { key: "order-volume", label: "Order Volume", description: "Order volume classifications.", fields: [text("Order_Volume", "Order Volume", { required: true }), text("From", "From", { type: "number" }), text("To", "To", { type: "number" })] },
];

export const ORDER_LOOKUP_FIELDS = [
  lookup("entityName", "Entity Name", "entity"),
  lookup("category", "Category / Product Master", "category"),
  lookup("subCategory", "Sub Category", "sub-category", { dependsOn: "category" }),
  lookup("season", "Season", "season"),
  lookup("article", "Article", "article"),
  lookup("colors", "Colors", "color"),
  lookup("buyer", "Buyer", "buyer"),
  lookup("brand", "Brand", "brand"),
  lookup("sizeGroup", "Size Group", "size-group", { dependsOn: "brand" }),
];

export function getMasterDefinition(masterKey: string) {
  return MASTER_DEFINITIONS.find((entry) => entry.key === masterKey) ?? null;
}
