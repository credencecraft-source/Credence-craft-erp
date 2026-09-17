import { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

export const PROCUREMENT_MASTER_DEFINITIONS = [
  createMaster("vendor", "Vendor", "Supplier and vendor master.", [text("vendor", "Vendor", { required: true, unique: true }), text("Gst_Number", "GSTIN"), lookup("Registered_State", "Registered State", "state", { required: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 1 }),
  createMaster("gst", "GST", "GST rate master. The applicable tax type is calculated from the organization and vendor states.", [text("Name", "Name", { required: true }), text("Gst", "GST", { type: "percentage", required: true }), text("Cgst_Rate", "CGST Rate", { type: "percentage", required: true }), text("Sgst_Rate", "SGST Rate", { type: "percentage", required: true }), text("Igst_Rate", "IGST Rate", { type: "percentage", required: true }), text("Zoho_Books_Tax_ID", "Zoho Books Tax ID")], { labelField: "Name", moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 2 }),
  createMaster("hsn", "HSN Code", "HSN code and tax mapping.", [text("Hsn_Code", "HSN Code", { required: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 3 }),
  createMaster("currency-type", "Currency Type", "Currency type lookup values.", [text("Currency_Type", "Currency Type", { required: true, unique: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 4 }),
  createMaster("gst-type", "GST Type", "GST type lookup values.", [text("GST_TYPE", "GST Type", { required: true, unique: true })], { moduleGroup: "order-management", moduleSubGroup: "procurement", moduleOrder: 5 }),
  createMaster("state", "State", "Indian states and union territories used for tax registration and GST calculation.", [text("State", "State", { required: true, unique: true })], { moduleGroup: "settings", moduleSubGroup: "general", moduleOrder: 1 }),
];
