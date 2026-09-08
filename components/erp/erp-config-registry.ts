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

export const ERP_MODULES = [
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
  { key: "retails", label: "Retails", pathSegment: "retails", children: [] },
  { key: "distribution", label: "Distribution", pathSegment: "distribution", children: [] },
  { key: "online", label: "Online", pathSegment: "online", children: [] },
  {
    key: "approvals",
    label: "Approvals",
    pathSegment: "approvals",
    children: [],
  },
  {
    key: "settings",
    label: "Settings",
    pathSegment: "settings",
    children: [
      { key: "master-data", label: "Master Data", pathSegment: "master-data" },
      {
        key: "pricing",
        label: "Pricing Plan",
        pathSegment: "pricing",
        children: [
          { key: "plan", label: "Plan", pathSegment: "plan" },
        ],
      },
    ],
  },
] as const;

export type ErpModuleType = (typeof ERP_MODULES)[number];
export type ErpModuleKey = ErpModuleType["key"];