import { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

export const PRE_PRODUCTION_MASTER_DEFINITIONS = [
  createMaster("size-wise-consumption", "Size Wise Consumption", "Size wise consumption lookup values.", [text("Bom_Template_Name", "BOM Template Name", { required: true, unique: true })], { moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 1 }),
  createMaster("product-master", "FG Product Master", "Finished goods product master lookup values.", [text("Product_Master_name", "FG Product Master Name", { required: true, unique: true })], { moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 2 }),
  createMaster("process-master", "Process Master", "Reusable production operations used inside process templates.", [text("Process_Name", "Process Name", { required: true, unique: true })], { labelField: "Process_Name", moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 3 }),
  createMaster("operation", "Operation", "Reusable operations used inside operation templates.", [text("Operation_Name", "Operation Name", { required: true, unique: true })], { labelField: "Operation_Name", moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 3.5 }),
  createMaster("process-template", "Process Template", "Production process templates with ordered process steps.", [
    text("Process_Template_Name", "Process Template Name", { required: true, unique: true }),
    {
      key: "Process_Steps",
      label: "Process Steps",
      type: "child-list",
      childModuleKey: "process-template-step",
      childFields: [
        lookup("Process", "Process", "process-master", { required: true }),
        text("Sl_No", "Sl No", { type: "number", required: true }),
      ],
    },
  ], { labelField: "Process_Template_Name", moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 4 }),
  createMaster("operation-template", "Operation Template", "Reusable ordered operation sets maintained for production processes.", [
    text("Operation_Template_Name", "Operation Template Name", { required: true, unique: true }),
    lookup("Process", "Process Master", "process-master", { required: true }),
    {
      key: "Operations",
      label: "Operations",
      type: "child-list",
      childModuleKey: "operation-template-step",
      childFields: [
        text("Operation", "Operation", { required: true }),
        text("Sl_No", "Sl No", { type: "number", required: true }),
        text("Price", "Price", { type: "decimal", required: true }),
      ],
    },
  ], { labelField: "Operation_Template_Name", moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 5 }),
  createMaster("process-template-step", "Process Template Step", "Internal child records for process templates.", [
    lookup("Process", "Process", "process-master", { required: true }),
    text("Sl_No", "Sl No", { type: "number", required: true }),
  ], { labelField: "Process", hidden: true }),
  createMaster("operation-template-step", "Operation Template Step", "Internal child records for operation templates.", [
    text("Operation", "Operation", { required: true }),
    text("Sl_No", "Sl No", { type: "number", required: true }),
    text("Price", "Price", { type: "decimal", required: true }),
  ], { labelField: "Operation", hidden: true }),
];
