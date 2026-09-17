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
    key: "pos",
    label: "POS",
    pathSegment: "pos",
    children: [
      { key: "quick-invoice", label: "Quick Invoice", pathSegment: "quick-invoice" },
    ],
  },
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
      {
        key: "procurement",
        label: "Procurement",
        pathSegment: "procurement",
        children: [
          { key: "general-po", label: "General PO", pathSegment: "create-po/general-po/allocate-vendor" },
          { key: "style-wise-po", label: "Style Wise PO", pathSegment: "create-po/style-wise" },
          { key: "purchase-order", label: "Purchase Order", pathSegment: "purchase-order" },
        ],
      },
    ],
  },
  {
    key: "design-development",
    label: "Design and Development",
    pathSegment: "design-development",
    children: [
      {
        key: "tech-pack",
        label: "Tech Pack",
        pathSegment: "tech-pack",
        children: [
          { key: "articles", label: "Articles", pathSegment: "articles" },
        ],
      },
    ],
  },
  {
    key: "factory-management",
    label: "Factory Management",
    pathSegment: "factory-management",
    children: [
      {
        key: "pre-production",
        label: "Pre Production",
        pathSegment: "pre-production",
        children: [
          { key: "work-order", label: "Work Order", pathSegment: "work-order" },
        ],
      },
      {
        key: "production",
        label: "Production",
        pathSegment: "production",
        children: [
          { key: "shop-floor", label: "Shop Floor", pathSegment: "shop-floor" },
        ],
      },
      {
        key: "post-production",
        label: "Post Production",
        pathSegment: "post-production",
        children: [
          { key: "scan-pack", label: "Scan Pack", pathSegment: "scan-pack" },
        ],
      },
    ],
  },
  {
    key: "quality-management-system",
    label: "Quality Management System",
    pathSegment: "quality-management-system",
    children: [
      {
        key: "raw-material",
        label: "Raw Material",
        pathSegment: "raw-material",
        children: [
          { key: "rm-quality-check", label: "RM Quality Check", pathSegment: "rm-quality-check" },
        ],
      },
      {
        key: "finished-goods",
        label: "Finished Goods",
        pathSegment: "finished-goods",
        children: [
          { key: "fg-quality-check", label: "FG Quality Check", pathSegment: "fg-quality-check" },
        ],
      },
    ],
  },
  {
    key: "finance-management",
    label: "Finance Management",
    pathSegment: "finance-management",
    children: [
      {
        key: "transactions",
        label: "Transactions",
        pathSegment: "transactions",
        children: [
          { key: "sales-invoice", label: "Sales Invoice", pathSegment: "sales-invoice" },
          { key: "purchase-invoice", label: "Purchase Invoice", pathSegment: "purchase-invoice" },
          { key: "debit-note", label: "Debit Note", pathSegment: "debit-note" },
          { key: "credit-note", label: "Credit Note", pathSegment: "credit-note" },
          { key: "delivery-challan", label: "Delivery Challan", pathSegment: "delivery-challan" },
        ],
      },
    ],
  },
  {
    key: "inventory-management",
    label: "Inventory Management",
    pathSegment: "inventory-management",
    children: [
      { key: "gate-entry", label: "Gate Entry", pathSegment: "gate-entry" },
      { key: "gate-entry-reports", label: "Gate Entry Reports", pathSegment: "gate-entry/reports" },
      {
        key: "inward",
        label: "Inward",
        pathSegment: "inward",
        children: [
          { key: "rm-grn", label: "RM GRN", pathSegment: "grn" },
          { key: "packing-list-grn", label: "Packing List GRN", pathSegment: "packing-list-grn" },
          { key: "wo-grn", label: "WO GRN", pathSegment: "wo-grn" },
          { key: "returnable-dc-grn", label: "Returnable DC GRN", pathSegment: "returnable-dc-grn" },
        ],
      },
      {
        key: "outward",
        label: "Outward",
        pathSegment: "outward",
        children: [
          { key: "raw-material-dc", label: "Raw Material DC", pathSegment: "raw-material-dc" },
        ],
      },
      {
        key: "stock",
        label: "Stock",
        pathSegment: "stock",
        children: [
          { key: "rm-stock", label: "RM Stock", pathSegment: "rm-stock" },
          { key: "fg-stock", label: "FG Stock", pathSegment: "fg-stock" },
        ],
      },
    ],
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
      {
        key: "purchase-order-approval",
        label: "Purchase Order",
        pathSegment: "approval-settings/purchase-order-review",
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    pathSegment: "settings",
    children: [
      {
        key: "pricing",
        label: "Pricing",
        pathSegment: "pricing",
        children: [
          { key: "plan", label: "Plan", pathSegment: "plan" },
        ],
      },
      { key: "users", label: "Users", pathSegment: "users" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    pathSegment: "admin",
    children: [
      { key: "master-data", label: "Masters", pathSegment: "master-data" },
    ],
  },
];

const BUSINESS_TYPE_MODULE_ALIASES: Record<string, string> = {
  "pos": "pos",
  "point-of-sale": "pos",
  "order-management": "order-management",
  "design-development": "design-development",
  "design-and-development": "design-development",
  "factory-management": "factory-management",
  "quality-management-system": "quality-management-system",
  "quality-management": "quality-management-system",
  "finance-management": "finance-management",
  "inventory-management": "inventory-management",
  "settings": "settings",
  "setting": "settings",
  "admin": "admin",
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