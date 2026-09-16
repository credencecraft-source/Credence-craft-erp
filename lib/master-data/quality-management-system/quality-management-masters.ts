import { createMaster, text } from "@/lib/master-data/master-data-models";

export const QUALITY_MANAGEMENT_MASTER_DEFINITIONS = [
  createMaster("rm-quality-check", "RM Quality Check", "Raw material quality inspection definition and checklist values.", [
    text("Inspection_Name", "Inspection Name", { required: true, unique: true }),
    text("Lot_No", "Lot No", { required: true }),
    text("Inspection_Result", "Inspection Result", { type: "picklist", options: ["Pass", "Fail"] }),
  ], { moduleGroup: "quality-management-system", moduleSubGroup: "raw-material", moduleOrder: 1, hidden: true }),
  createMaster("fg-quality-check", "FG Quality Check", "Finished goods inspection definition and checklist values.", [
    text("Inspection_Name", "Inspection Name", { required: true, unique: true }),
    text("Batch_No", "Batch No", { required: true }),
    text("Inspection_Result", "Inspection Result", { type: "picklist", options: ["Pass", "Fail"] }),
  ], { moduleGroup: "quality-management-system", moduleSubGroup: "finished-goods", moduleOrder: 1, hidden: true }),
];
