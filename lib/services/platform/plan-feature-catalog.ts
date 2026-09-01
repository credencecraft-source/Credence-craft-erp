// Canonical list of togglable ERP features shown on the Setup Plans screen.
export type PlanFeatureCatalogItem = {
  feature_key: string;
  feature_name: string;
};

export const PLAN_FEATURE_CATALOG: PlanFeatureCatalogItem[] = [
  { feature_key: "order_management", feature_name: "Order Management" },
  { feature_key: "merchandising_orders", feature_name: "Merchandising Orders" },
  { feature_key: "master_data", feature_name: "Master Data" },
  { feature_key: "approvals", feature_name: "Approvals Workflow" },
  { feature_key: "factory_management", feature_name: "Factory Management" },
  { feature_key: "reports", feature_name: "Reports" },
  { feature_key: "multi_currency", feature_name: "Multi-Currency Support" },
  { feature_key: "api_access", feature_name: "API Access" },
  { feature_key: "priority_support", feature_name: "Priority Support" },
];
