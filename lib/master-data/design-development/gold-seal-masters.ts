import { createMaster, text } from "@/lib/master-data/master-data-models";

export const GOLD_SEAL_MASTER_DEFINITIONS = [
  createMaster("gold-seal", "Gold Seal", "Reusable trading product templates with fixed stock variants.", [
    text("gold_seal", "Gold Seal Name", { required: true, unique: true }),
    text("gold_seal_code", "Gold Seal Code", { readOnly: true }),
    text("design_by", "Design By"),
    text("designed_date", "Designed Date", { type: "date" }),
  ], { labelField: "gold_seal", moduleGroup: "design-development", moduleSubGroup: "tech-pack", moduleOrder: 1 }),
  createMaster("gold-seal-variant", "Gold Seal Variant", "Fixed stock variant belonging to a Gold Seal product.", [
    text("variant", "Variant Name", { required: true }),
    text("variant_code", "Variant Code", { required: true }),
    text("color", "Color"),
    text("size", "Size"),
    text("sku", "SKU"),
    text("barcode", "Barcode"),
  ], { labelField: "variant", hidden: true }),
];
