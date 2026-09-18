import { MERCHANDISING_MASTER_DEFINITIONS } from "@/lib/master-data/order-management/merchandising/merchandising-masters";
import { PROCUREMENT_MASTER_DEFINITIONS } from "@/lib/master-data/order-management/procurement/procurement-masters";
import { PRE_PRODUCTION_MASTER_DEFINITIONS } from "@/lib/master-data/factory-management/pre-production/pre-production-masters";
import { PRODUCTION_MASTER_DEFINITIONS } from "@/lib/master-data/factory-management/production/production-masters";
import { INVENTORY_MASTER_DEFINITIONS } from "@/lib/master-data/inventory-management/inventory-masters";
import { QUALITY_MANAGEMENT_MASTER_DEFINITIONS } from "@/lib/master-data/quality-management-system/quality-management-masters";
import { FINANCE_MANAGEMENT_MASTER_DEFINITIONS } from "@/lib/master-data/finance-management/finance-management-masters";
import { GOLD_SEAL_MASTER_DEFINITIONS } from "@/lib/master-data/design-development/gold-seal-masters";
import { createMaster, type MasterDefinition, type MasterFieldDefinition, type MasterFieldType } from "@/lib/master-data/master-data-models";

export type { MasterFieldType, MasterFieldDefinition, MasterDefinition } from "@/lib/master-data/master-data-models";
export { createMaster, lookup, text } from "@/lib/master-data/master-data-models";

const GENERAL_MASTER_DEFINITIONS: MasterDefinition[] = [
  createMaster("status", "Status", "General ERP status labels.", [], { hidden: true, moduleGroup: "admin", moduleSubGroup: "general", moduleOrder: 1 }),
  createMaster("entity-type", "Entity Type", "General entity classifications.", [], { hidden: true, moduleGroup: "settings", moduleSubGroup: "general", moduleOrder: 1 }),
];

export const MASTER_DEFINITIONS: MasterDefinition[] = [
  ...MERCHANDISING_MASTER_DEFINITIONS,
  ...PROCUREMENT_MASTER_DEFINITIONS,
  ...PRE_PRODUCTION_MASTER_DEFINITIONS,
  ...PRODUCTION_MASTER_DEFINITIONS,
  ...INVENTORY_MASTER_DEFINITIONS,
  ...QUALITY_MANAGEMENT_MASTER_DEFINITIONS,
  ...FINANCE_MANAGEMENT_MASTER_DEFINITIONS,
  ...GOLD_SEAL_MASTER_DEFINITIONS,
  ...GENERAL_MASTER_DEFINITIONS,
];

export const MASTER_MODULE_HIERARCHY: Record<string, { label: string; children: Record<string, string> }> = {
  "order-management": {
    label: "Order Management",
    children: {
      merchandising: "Merchandising",
      procurement: "Procurement",
    },
  },
  "design-development": {
    label: "Design and Development",
    children: {
      "tech-pack": "Tech Pack",
    },
  },
  "factory-management": {
    label: "Factory Management",
    children: {
      "pre-production": "Pre Production",
      production: "Production",
      "post-production": "Post Production",
    },
  },
  "inventory-management": {
    label: "Inventory Management",
    children: {
      inward: "Inward",
      outward: "Outward",
      stock: "Stock",
    },
  },
  "quality-management-system": {
    label: "Quality Management System",
    children: {
      "raw-material": "Raw Material",
      "finished-goods": "Finished Goods",
    },
  },
  "finance-management": {
    label: "Finance Management",
    children: {
      transactions: "Transactions",
    },
  },
  approvals: {
    label: "Approvals",
    children: {
      "approval-settings": "Master",
      "purchase-order-approval": "Purchase Order",
    },
  },
  settings: {
    label: "Settings",
    children: {
      pricing: "Pricing",
      users: "Users",
      general: "General",
    },
  },
  admin: {
    label: "Admin",
    children: {
      "master-data": "Masters",
      general: "General",
    },
  },
};

export const ORDER_LOOKUP_FIELDS = [
  { key: "entityName", label: "Entity Name", type: "lookup", lookupModuleKey: "entity" },
  { key: "category", label: "Product Category", type: "lookup", lookupModuleKey: "category" },
  { key: "subCategory", label: "Product Sub Category", type: "lookup", lookupModuleKey: "sub-category", dependsOn: "category" },
  { key: "season", label: "Season", type: "lookup", lookupModuleKey: "season" },
  { key: "article", label: "Article", type: "lookup", lookupModuleKey: "article" },
  { key: "colors", label: "Colors", type: "lookup", lookupModuleKey: "color" },
  { key: "buyer", label: "Buyer", type: "lookup", lookupModuleKey: "buyer" },
  { key: "brand", label: "Brand", type: "lookup", lookupModuleKey: "brand" },
  { key: "sizeGroup", label: "Size Group", type: "lookup", lookupModuleKey: "size-group" },
];

export function getMasterDefinition(masterKey: string) {
  return MASTER_DEFINITIONS.find((entry) => entry.key === masterKey) ?? null;
}

export function getMasterModuleGroupInfo(masterKey: string) {
  const definition = MASTER_DEFINITIONS.find((entry) => entry.key === masterKey);
  if (!definition) {
    return { topLevel: "admin", topLevelLabel: "Admin", subLevel: "general", subLevelLabel: "General" };
  }

  const topLevel = definition.moduleGroup ?? "admin";
  const topLevelLabel = MASTER_MODULE_HIERARCHY[topLevel]?.label ?? "Admin";
  const subLevel = definition.moduleSubGroup ?? "general";
  const subLevelLabel = MASTER_MODULE_HIERARCHY[topLevel]?.children[subLevel] ?? "General";

  return { topLevel, topLevelLabel, subLevel, subLevelLabel };
}
