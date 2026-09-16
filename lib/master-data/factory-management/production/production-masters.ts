import { createMaster } from "@/lib/master-data/master-data-models";

export const PRODUCTION_MASTER_DEFINITIONS = [
  createMaster("production-setup", "Production Setup", "Production execution and shop-floor setup entries.", [], {
    hidden: true,
    moduleGroup: "factory-management",
    moduleSubGroup: "production",
    moduleOrder: 1,
  }),
];
