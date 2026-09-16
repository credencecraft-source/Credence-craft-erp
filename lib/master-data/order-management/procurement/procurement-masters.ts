import { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

export const PROCUREMENT_MASTER_DEFINITIONS = [
  createMaster("vendor", "Vendor", "Supplier and vendor master.", [text("vendor", "Vendor", { required: true, unique: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 1 }),
  createMaster("gst", "GST", "GST configuration master.", [text("Name", "Name", { required: true }), text("Gst", "GST", { type: "percentage" }), lookup("GST_TYPELOOKUP1", "GST Type", "gst-type"), text("Zoho_Books_Tax_ID", "Zoho Books Tax ID")], { labelField: "Name", moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 2 }),
  createMaster("hsn", "HSN Code", "HSN code and tax mapping.", [text("Hsn_Code", "HSN Code", { required: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 3 }),
  createMaster("currency-type", "Currency Type", "Currency type lookup values.", [text("Currency_Type", "Currency Type", { required: true, unique: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 4 }),
  createMaster("gst-type", "GST Type", "GST type lookup values.", [text("GST_TYPE", "GST Type", { required: true, unique: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 5 }),
];
