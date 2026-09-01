export const ERP_MODULES = [
  {
    key: "order-management",
    label: "Order Management",
    pathSegment: "order-management",
  },
  {
    key: "factory-management",
    label: "Factory Management",
    pathSegment: "factory-management",
  },
  {
    key: "finance-management",
    label: "Finance Management",
    pathSegment: "finance-management",
  },
  { key: "retails", label: "Retails", pathSegment: "retails" },
  { key: "distribution", label: "Distribution", pathSegment: "distribution" },
  { key: "online", label: "Online", pathSegment: "online" },
  { key: "approvals", label: "Approvals", pathSegment: "approvals" },
  { key: "settings", label: "Settings", pathSegment: "settings" },
] as const;

export type ErpModule = (typeof ERP_MODULES)[number];
export type ErpModuleKey = ErpModule["key"];
