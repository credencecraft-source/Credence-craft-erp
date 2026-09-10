// @/components/erp/erp-config-registry.ts

export type SubModuleOption = {
  key: string;
  label: string;
  pathSegment?: string;
  children?: SubModuleOption[];
};

export type ErpModule = {
  key: string;
  label: string;
  pathSegment: string;
  children: SubModuleOption[];
};

export const ERP_MODULES: ErpModule[] = [
  {
    key: "order-management",
    label: "Order Management",
    pathSegment: "order-management",
    children: [
      {
        key: "merchandising",
        label: "Merchandising",
        pathSegment: "merchandising",
        children: [
          { key: "order", label: "Order", pathSegment: "order" },
          { key: "bom", label: "BOM", pathSegment: "bom" },
          { key: "order-summary", label: "Order Summary", pathSegment: "order-summary" },
        ],
      },
    ],
  },
  {
    key: "factory-management",
    label: "Factory Management",
    pathSegment: "factory-management",
    children: [],
  },
  {
    key: "finance-management",
    label: "Finance Management",
    pathSegment: "finance-management",
    children: [],
  },
  {
    key: "inventory-management",
    label: "Inventory Management",
    pathSegment: "inventory-management",
    children: [],
  },
  {
    key: "approvals",
    label: "Approvals",
    pathSegment: "approvals",
    children: [
      {
        key: "approval-settings",
        label: "Master",
        pathSegment: "approval-settings",
        children: [
          { key: "master-review", label: "Master Review", pathSegment: "master-review" },
        ],
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    pathSegment: "settings",
    children: [
      { key: "master-data", label: "Masters", pathSegment: "master-data" },
      {
        key: "pricing",
        label: "Pricing",
        pathSegment: "pricing",
        children: [
          { key: "plan", label: "Plan", pathSegment: "plan" },
        ],
      },
    ],
  },
];

const BUSINESS_TYPE_MODULE_ALIASES: Record<string, string> = {
  "order-management": "order-management",
  "factory-management": "factory-management",
  "finance-management": "finance-management",
  "inventory-management": "inventory-management",
  "settings": "settings",
  "setting": "settings",
  "approvals": "approvals",
  "approval": "approvals",
};

export function getErpModuleForBusinessTypeName(name: string) {
  const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const moduleKey = BUSINESS_TYPE_MODULE_ALIASES[normalizedName];
  return ERP_MODULES.find((module) => module.key === moduleKey) ?? null;
}

export type ErpModuleType = (typeof ERP_MODULES)[number];
export type ErpModuleKey = ErpModuleType["key"];