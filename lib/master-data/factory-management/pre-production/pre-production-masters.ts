import { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

export const PRE_PRODUCTION_MASTER_DEFINITIONS = [
  createMaster("size-wise-consumption", "Size Wise Consumption", "Size wise consumption lookup values.", [text("Bom_Template_Name", "BOM Template Name", { required: true, unique: true })], { moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 1 }),
  createMaster("product-master", "Product Master", "Product master lookup values.", [text("Product_Master_name", "Product Master Name", { required: true, unique: true })], { moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 2 }),
  createMaster("process-master", "Process Master", "Reusable production operations used inside process templates.", [text("Process_Name", "Process Name", { required: true, unique: true })], { labelField: "Process_Name", moduleGroup: "factory-management", moduleSubGroup: "pre-production", moduleOrder: 3 }),
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
];
