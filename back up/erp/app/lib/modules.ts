export type ModuleSubscription = {
  moduleName?: string | null;
  name?: string | null;
};

export type ModuleDefinition = {
  label: string;
  eyebrow: string;
  items?: { label: string; href: string }[];
};

export const defaultModuleCatalog: ModuleDefinition[] = [
  {
    label: "Order Management",
    eyebrow: "01",
    items: [
      { label: "Merchandising", href: "/order-management/merchandising" },
      { label: "Purchase", href: "/order-management/purchase" },
    ],
  },
  {
    label: "Factory Management",
    eyebrow: "02",
    items: [],
  },
  {
    label: "Finance Management",
    eyebrow: "03",
    items: [],
  },
  {
    label: "Retail",
    eyebrow: "04",
    items: [],
  },
  {
    label: "Distribution",
    eyebrow: "05",
    items: [],
  },
  {
    label: "Tenants",
    eyebrow: "06",
    items: [
      { label: "Tenant List", href: "/tenants" },
    ],
  },
  {
    label: "Settings and Control",
    eyebrow: "07",
    items: [
      { label: "Masters", href: "/settings/masters" },
      { label: "Permission", href: "/settings/permission" },
      { label: "Subscription", href: "/settings/subscription" },
    ],
  },
];

function normalizeModuleName(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getAccessibleModules(subscriptions: ModuleSubscription[] = []): ModuleDefinition[] {
  const granted = new Set(
    subscriptions
      .map((subscription) => subscription.moduleName ?? subscription.name)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => normalizeModuleName(value))
  );

  const hasOrderManagement = granted.has("order management") || granted.has("merchandising");
  const hasFactoryManagement = granted.has("factory management");
  const hasFinanceManagement = granted.has("finance management") || granted.has("accounting");
  const hasRetail = granted.has("retail") || granted.has("stores");
  const hasDistribution = granted.has("distribution") || granted.has("logistics");
  const hasTenants = granted.has("tenants") || granted.has("tenant management") || granted.has("tenant list");
  const hasSettingsAndControl =
    granted.has("settings and control") ||
    granted.has("settings") ||
    granted.has("master settings") ||
    granted.has("master data") ||
    granted.has("masters") ||
    granted.has("user access") ||
    granted.has("users roles") ||
    granted.has("subscription management");

  const available = defaultModuleCatalog.filter((module) => {
    if (module.label === "Order Management") return hasOrderManagement;
    if (module.label === "Factory Management") return hasFactoryManagement;
    if (module.label === "Finance Management") return hasFinanceManagement;
    if (module.label === "Retail") return hasRetail;
    if (module.label === "Distribution") return hasDistribution;
    if (module.label === "Tenants") return hasTenants;
    if (module.label === "Settings and Control") return hasSettingsAndControl;
    return true;
  });

  return available.length > 0 ? available : defaultModuleCatalog;
}
