import { ERP_MODULES } from "@/components/erp/erp-config-registry";

const BASE_ORGANIZATION_PERMISSIONS = [
  "ORGANIZATION_SETTINGS",
  "MANAGE_USERS",
  "MANAGE_ROLES",
  "MANAGE_TAX_RULES",
  "VIEW_REPORTS",
  "MANAGE_MASTER_DATA",
  "CREATE_ORDERS",
  "SHARE_ORDERS",
  "APPROVE_ORDERS",
  "VIEW_ORDERS",
  "UPDATE_ORDERS",
  "DELETE_ORDERS",
  "VIEW_POS_SALES",
  "VIEW_POS_COUNTERS",
  "CREATE_POS_COUNTERS",
  "VIEW_POS_SALES_RETURNS",
  "VIEW_FACTORY_PRODUCTION",
  "UPDATE_FACTORY_PRODUCTION",
  "MANAGE_FACTORY_PRODUCTION",
  "VIEW_WORK_ORDERS",
  "CREATE_WORK_ORDERS",
  "UPDATE_WORK_ORDERS",
  "DELETE_WORK_ORDERS",
  "DELETE_GATE_ENTRIES",
  "VIEW_GATE_ENTRIES",
  "CREATE_GATE_ENTRIES",
  "DELETE_INVENTORY_RECEIPTS",
  "CREATE_POS_SALES",
  "CREATE_POS_SALES_RETURNS",
  "SETTLE_POS_SALES_RETURN_REFUNDS",
  "VIEW_PURCHASE_ORDERS",
  "CREATE_PURCHASE_ORDERS",
  "UPDATE_PURCHASE_ORDERS",
  "DELETE_PURCHASE_ORDERS",
  "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL",
  "SHARE_PURCHASE_ORDERS",
  "APPROVE_PURCHASE_ORDERS",
  "REJECT_PURCHASE_ORDERS",
  "ADJUST_RAW_MATERIAL_STOCK",
  "VIEW_INVENTORY_STOCK",
  "CREATE_FINISHED_GOODS_STOCK",
  "ADJUST_FINISHED_GOODS_STOCK",
  "RESERVE_RAW_MATERIAL_STOCK",
  "REQUEST_RAW_MATERIAL_OUTWARD",
  "MANAGE_RAW_MATERIAL_OUTWARD",
  "REQUEST_FINISHED_GOODS_OUTWARD",
  "MANAGE_FINISHED_GOODS_OUTWARD",
  "VIEW_STORAGE_NODES",
  "MANAGE_STORAGE_NODES",
  "VIEW_POS_OFFERS",
  "MANAGE_POS_OFFERS",
  "VIEW_POS_COUPONS",
  "MANAGE_POS_COUPONS",
  "VIEW_POS_ONLINE_STORE",
  "MANAGE_POS_ONLINE_STORE",
  "VIEW_INVENTORY_RECEIPTS",
  "MANAGE_INVENTORY_RECEIPTS",
  "VIEW_POS_PURCHASE_RECORDS",
  "MANAGE_POS_PURCHASE_RECORDS",
  "DELETE_POS_PURCHASE_RECORDS",
  "POST_POS_PURCHASE_BILLS",
  "MANAGE_FINANCE_INTEGRATIONS",
  "DISPATCH_FINANCE_SYNC",
  "CREATE_PROCUREMENT_VENDOR_BILL",
  "SUBMIT_PROCUREMENT_VENDOR_BILL",
  "APPROVE_PROCUREMENT_VENDOR_BILL",
  "POST_PROCUREMENT_VENDOR_BILL",
  "SUBMIT_FINANCE_DOCUMENT",
  "APPROVE_FINANCE_DOCUMENT",
  "POST_FINANCE_DOCUMENT",
  "LOCK_FINANCE_DOCUMENT",
  "CANCEL_FINANCE_DOCUMENT",
  "REVERSE_FINANCE_DOCUMENT",
  "ACCESS_MODULE_ONLINE",
  "ACCESS_MODULE_POS",
  "ACCESS_MODULE_ORDER_MANAGEMENT",
  "ACCESS_MODULE_ASSET_MANAGEMENT",
  "ACCESS_MODULE_DESIGN_DEVELOPMENT",
  "ACCESS_MODULE_FACTORY_MANAGEMENT",
  "ACCESS_MODULE_UNIFORM_MANAGEMENT",
  "ACCESS_MODULE_QUALITY_MANAGEMENT_SYSTEM",
  "ACCESS_MODULE_FINANCE_MANAGEMENT",
  "ACCESS_MODULE_INVENTORY_MANAGEMENT",
  "ACCESS_MODULE_DISTRIBUTION",
  "ACCESS_MODULE_SECURITY_MANAGEMENT",
  "ACCESS_MODULE_APPROVALS",
  "ACCESS_MODULE_SETTINGS",
  "ACCESS_MODULE_ADMIN",
] as const;

export const ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY = {
  online: "ACCESS_MODULE_ONLINE",
  pos: "ACCESS_MODULE_POS",
  "order-management": "ACCESS_MODULE_ORDER_MANAGEMENT",
  "asset-management": "ACCESS_MODULE_ASSET_MANAGEMENT",
  "design-development": "ACCESS_MODULE_DESIGN_DEVELOPMENT",
  "factory-management": "ACCESS_MODULE_FACTORY_MANAGEMENT",
  "uniform-management": "ACCESS_MODULE_UNIFORM_MANAGEMENT",
  "quality-management-system": "ACCESS_MODULE_QUALITY_MANAGEMENT_SYSTEM",
  "finance-management": "ACCESS_MODULE_FINANCE_MANAGEMENT",
  "inventory-management": "ACCESS_MODULE_INVENTORY_MANAGEMENT",
  distribution: "ACCESS_MODULE_DISTRIBUTION",
  "security-management": "ACCESS_MODULE_SECURITY_MANAGEMENT",
  approvals: "ACCESS_MODULE_APPROVALS",
  settings: "ACCESS_MODULE_SETTINGS",
  admin: "ACCESS_MODULE_ADMIN",
} as const satisfies Record<string, OrganizationPermissionKey>;

export type OrganizationModuleAccessPermission =
  (typeof ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY)[keyof typeof ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY];

export type OrganizationSubmoduleAccessPermission = `ACCESS_SUBMODULE:${string}`;
export type OrganizationOrderManagementAction = "view" | "create" | "edit" | "delete";
export type OrganizationOrderManagementResource =
  | "merchandising/order"
  | "merchandising/bulk-order-creation"
  | "merchandising/bom"
  | "merchandising/style-health"
  | "merchandising/order-summary"
  | "procurement/general-po"
  | "procurement/style-wise-po"
  | "procurement/purchase-order";
export type OrganizationOrderManagementPermission =
  `ORDER_MANAGEMENT:${OrganizationOrderManagementResource}:${Uppercase<OrganizationOrderManagementAction>}`;
export type OrganizationPermissionKey =
  | (typeof BASE_ORGANIZATION_PERMISSIONS)[number]
  | OrganizationSubmoduleAccessPermission
  | OrganizationOrderManagementPermission;

const ORGANIZATION_MODULE_ACCESS_PERMISSIONS = Object.values(ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY);

export type OrganizationModuleNavigationItem = {
  key: string;
  keyPath: string[];
  label: string;
  routePath: string;
  accessPermission: OrganizationSubmoduleAccessPermission;
  children: OrganizationModuleNavigationItem[];
};

export function getOrganizationModuleNavigationItems(moduleKey: string): OrganizationModuleNavigationItem[] {
  const erpModule = ERP_MODULES.find((item) => item.key === moduleKey);
  if (!erpModule) return [];

  const buildItems = (
    items: typeof erpModule.children,
    parentPath: string,
    parentKeys: readonly string[],
  ): OrganizationModuleNavigationItem[] => items.map((item) => {
    const keyPath = [...parentKeys, item.key];
    const routePath = item.href || `${parentPath}/${item.pathSegment || item.key}`;
    return {
      key: item.key,
      keyPath,
      label: item.label,
      routePath,
      accessPermission: `ACCESS_SUBMODULE:${erpModule.key}:${keyPath.join("/")}`,
      children: buildItems(item.children || [], routePath, keyPath),
    };
  });

  return buildItems(erpModule.children, `/${erpModule.pathSegment}`, []);
}

function flattenOrganizationModuleNavigation(
  items: readonly OrganizationModuleNavigationItem[],
): OrganizationModuleNavigationItem[] {
  return items.flatMap((item) => [item, ...flattenOrganizationModuleNavigation(item.children)]);
}

const ORGANIZATION_SUBMODULE_ACCESS_PERMISSIONS = ERP_MODULES.flatMap(({ key }) =>
  flattenOrganizationModuleNavigation(getOrganizationModuleNavigationItems(key))
    .map(({ accessPermission }) => accessPermission),
);

const ORDER_MANAGEMENT_RESOURCE_LEGACY_PERMISSIONS = {
  "merchandising/order": {
    view: "VIEW_ORDERS",
    create: "CREATE_ORDERS",
    edit: "UPDATE_ORDERS",
    delete: "DELETE_ORDERS",
  },
  "merchandising/bulk-order-creation": {
    view: "VIEW_ORDERS",
    create: "CREATE_ORDERS",
  },
  "merchandising/bom": {
    view: "VIEW_ORDERS",
  },
  "merchandising/style-health": {
    view: "VIEW_ORDERS",
  },
  "merchandising/order-summary": {
    view: "VIEW_ORDERS",
  },
  "procurement/general-po": {
    view: "VIEW_PURCHASE_ORDERS",
    create: "CREATE_PURCHASE_ORDERS",
    edit: "UPDATE_PURCHASE_ORDERS",
  },
  "procurement/style-wise-po": {
    view: "VIEW_PURCHASE_ORDERS",
    create: "CREATE_PURCHASE_ORDERS",
    edit: "UPDATE_PURCHASE_ORDERS",
    delete: "DELETE_PURCHASE_ORDERS",
  },
  "procurement/purchase-order": {
    view: "VIEW_PURCHASE_ORDERS",
    create: "CREATE_PURCHASE_ORDERS",
    edit: "UPDATE_PURCHASE_ORDERS",
    delete: "DELETE_PURCHASE_ORDERS",
  },
} as const satisfies Record<
  OrganizationOrderManagementResource,
  Partial<Record<OrganizationOrderManagementAction, OrganizationPermissionKey>>
>;

const ORDER_MANAGEMENT_ACTION_PERMISSIONS = Object.entries(ORDER_MANAGEMENT_RESOURCE_LEGACY_PERMISSIONS)
  .flatMap(([resource, actions]) => Object.keys(actions).map((action) =>
    `ORDER_MANAGEMENT:${resource}:${action.toUpperCase()}` as OrganizationOrderManagementPermission,
  ));

export function getOrganizationOrderManagementPermission(
  resource: OrganizationOrderManagementResource,
  action: OrganizationOrderManagementAction,
): OrganizationOrderManagementPermission | undefined {
  if (!getOrganizationOrderManagementLegacyPermission(resource, action)) return undefined;
  return `ORDER_MANAGEMENT:${resource}:${action.toUpperCase()}` as OrganizationOrderManagementPermission;
}

export function getOrganizationOrderManagementLegacyPermission(
  resource: OrganizationOrderManagementResource,
  action: OrganizationOrderManagementAction,
): OrganizationPermissionKey | undefined {
  const permissions: Partial<Record<OrganizationOrderManagementAction, OrganizationPermissionKey>> | undefined =
    ORDER_MANAGEMENT_RESOURCE_LEGACY_PERMISSIONS[resource];
  return permissions?.[action];
}

export function getLegacyOrganizationOrderManagementPermissions(
  effectivePermissions: readonly OrganizationPermissionKey[],
): OrganizationOrderManagementPermission[] {
  return Object.entries(ORDER_MANAGEMENT_RESOURCE_LEGACY_PERMISSIONS).flatMap(([resource, actions]) =>
    Object.entries(actions)
      .filter(([, legacyPermission]) => effectivePermissions.includes(legacyPermission))
      .map(([action]) =>
        `ORDER_MANAGEMENT:${resource}:${action.toUpperCase()}` as OrganizationOrderManagementPermission,
      ),
  );
}

export function isOrganizationOrderManagementPermission(
  permission: string,
): permission is OrganizationOrderManagementPermission {
  return ORDER_MANAGEMENT_ACTION_PERMISSIONS.includes(permission as OrganizationOrderManagementPermission);
}

export const ORGANIZATION_PERMISSIONS: readonly OrganizationPermissionKey[] = [
  ...BASE_ORGANIZATION_PERMISSIONS,
  ...ORGANIZATION_SUBMODULE_ACCESS_PERMISSIONS,
  ...ORDER_MANAGEMENT_ACTION_PERMISSIONS,
];

export const ORGANIZATION_PERMISSION_LABELS: Readonly<Record<string, string>> = {
  ORGANIZATION_SETTINGS: "Manage organization settings",
  MANAGE_USERS: "Manage users",
  MANAGE_ROLES: "Manage roles",
  MANAGE_TAX_RULES: "Manage tax rules",
  VIEW_REPORTS: "View reports",
  MANAGE_MASTER_DATA: "Manage master data",
  CREATE_ORDERS: "Create orders",
  SHARE_ORDERS: "Share orders with another organization",
  APPROVE_ORDERS: "Approve orders",
  VIEW_ORDERS: "View orders",
  UPDATE_ORDERS: "Update orders",
  DELETE_ORDERS: "Delete orders",
  VIEW_POS_SALES: "View POS sales and invoices",
  VIEW_POS_COUNTERS: "View POS counters",
  CREATE_POS_COUNTERS: "Create POS counters",
  VIEW_POS_SALES_RETURNS: "View POS sales-return source invoices and credits",
  VIEW_FACTORY_PRODUCTION: "View factory production",
  UPDATE_FACTORY_PRODUCTION: "Update factory production",
  MANAGE_FACTORY_PRODUCTION: "Manage factory production",
  VIEW_WORK_ORDERS: "View work orders",
  CREATE_WORK_ORDERS: "Create work orders",
  UPDATE_WORK_ORDERS: "Update work orders",
  DELETE_WORK_ORDERS: "Delete work orders",
  DELETE_GATE_ENTRIES: "Delete gate entries",
  VIEW_GATE_ENTRIES: "View gate entries",
  CREATE_GATE_ENTRIES: "Create gate entries",
  DELETE_INVENTORY_RECEIPTS: "Delete inventory receipts",
  CREATE_POS_SALES: "Post POS sales",
  CREATE_POS_SALES_RETURNS: "Create POS sales returns",
  SETTLE_POS_SALES_RETURN_REFUNDS: "Settle POS sales-return refunds",
  VIEW_PURCHASE_ORDERS: "View Purchase Orders",
  CREATE_PURCHASE_ORDERS: "Create Purchase Orders",
  UPDATE_PURCHASE_ORDERS: "Update Purchase Orders",
  DELETE_PURCHASE_ORDERS: "Delete Purchase Orders",
  SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL: "Submit Purchase Orders for approval",
  SHARE_PURCHASE_ORDERS: "Share Purchase Orders",
  APPROVE_PURCHASE_ORDERS: "Approve Purchase Orders",
  REJECT_PURCHASE_ORDERS: "Reject Purchase Orders",
  ADJUST_RAW_MATERIAL_STOCK: "Adjust raw-material stock",
  VIEW_INVENTORY_STOCK: "View inventory stock and movements",
  CREATE_FINISHED_GOODS_STOCK: "Create finished-goods stock records",
  ADJUST_FINISHED_GOODS_STOCK: "Adjust finished-goods stock",
  RESERVE_RAW_MATERIAL_STOCK: "Reserve raw-material stock",
  REQUEST_RAW_MATERIAL_OUTWARD: "Request raw-material outward",
  MANAGE_RAW_MATERIAL_OUTWARD: "Manage raw-material outward workflow",
  REQUEST_FINISHED_GOODS_OUTWARD: "Request finished-goods outward",
  MANAGE_FINISHED_GOODS_OUTWARD: "Manage finished-goods outward workflow",
  VIEW_STORAGE_NODES: "View inventory storage hierarchy",
  MANAGE_STORAGE_NODES: "Manage inventory storage hierarchy",
  VIEW_POS_OFFERS: "View POS offers",
  MANAGE_POS_OFFERS: "Manage POS offers",
  VIEW_POS_COUPONS: "View POS coupons",
  MANAGE_POS_COUPONS: "Manage POS coupons",
  VIEW_POS_ONLINE_STORE: "View POS online-store settings",
  MANAGE_POS_ONLINE_STORE: "Manage POS online store and domains",
  VIEW_INVENTORY_RECEIPTS: "View inventory receipts and verification",
  MANAGE_INVENTORY_RECEIPTS: "Receive and verify inventory",
  VIEW_POS_PURCHASE_RECORDS: "View POS purchase records and bills",
  MANAGE_POS_PURCHASE_RECORDS: "Create and edit POS purchase records",
  DELETE_POS_PURCHASE_RECORDS: "Delete POS purchase records",
  POST_POS_PURCHASE_BILLS: "Post POS purchase bills",
  MANAGE_FINANCE_INTEGRATIONS: "Manage finance integration settings",
  DISPATCH_FINANCE_SYNC: "Dispatch and retry finance synchronization",
  CREATE_PROCUREMENT_VENDOR_BILL: "Create procurement vendor bills",
  SUBMIT_PROCUREMENT_VENDOR_BILL: "Submit procurement vendor bills",
  APPROVE_PROCUREMENT_VENDOR_BILL: "Approve procurement vendor bills",
  POST_PROCUREMENT_VENDOR_BILL: "Post procurement vendor bills",
  SUBMIT_FINANCE_DOCUMENT: "Submit finance documents",
  APPROVE_FINANCE_DOCUMENT: "Approve finance documents",
  POST_FINANCE_DOCUMENT: "Post finance documents",
  LOCK_FINANCE_DOCUMENT: "Lock finance documents",
  CANCEL_FINANCE_DOCUMENT: "Cancel unposted finance documents",
  REVERSE_FINANCE_DOCUMENT: "Reverse posted finance documents",
  ACCESS_MODULE_ONLINE: "Access Online",
  ACCESS_MODULE_POS: "Access POS",
  ACCESS_MODULE_ORDER_MANAGEMENT: "Access Order Management",
  ACCESS_MODULE_ASSET_MANAGEMENT: "Access Asset Management",
  ACCESS_MODULE_DESIGN_DEVELOPMENT: "Access Design and Development",
  ACCESS_MODULE_FACTORY_MANAGEMENT: "Access Factory Management",
  ACCESS_MODULE_UNIFORM_MANAGEMENT: "Access Uniform Management",
  ACCESS_MODULE_QUALITY_MANAGEMENT_SYSTEM: "Access Quality Management System",
  ACCESS_MODULE_FINANCE_MANAGEMENT: "Access Finance Management",
  ACCESS_MODULE_INVENTORY_MANAGEMENT: "Access Inventory Management",
  ACCESS_MODULE_DISTRIBUTION: "Access Advance Booking",
  ACCESS_MODULE_SECURITY_MANAGEMENT: "Access Security Management",
  ACCESS_MODULE_APPROVALS: "Access Approvals",
  ACCESS_MODULE_SETTINGS: "Access Settings",
  ACCESS_MODULE_ADMIN: "Access Admin",
  ...Object.fromEntries(ERP_MODULES.flatMap(({ key, label }) =>
    flattenOrganizationModuleNavigation(getOrganizationModuleNavigationItems(key)).map((item) => [
      item.accessPermission,
      `Access ${label} > ${item.label}`,
    ]),
  )),
  ...Object.fromEntries(Object.entries(ORDER_MANAGEMENT_RESOURCE_LEGACY_PERMISSIONS).flatMap(([resource, actions]) =>
    Object.keys(actions).map((action) => [
      `ORDER_MANAGEMENT:${resource}:${action.toUpperCase()}`,
      `${resource.split("/").map((part) => part.replaceAll("-", " ")).join(" > ")} — ${action}`,
    ]),
  )),
};

export const ORGANIZATION_PERMISSION_GROUPS = [
  {
    key: "organization-administration",
    label: "Organization administration",
    permissions: ["ORGANIZATION_SETTINGS", "MANAGE_USERS", "MANAGE_ROLES", "MANAGE_TAX_RULES"],
  },
  {
    key: "master-management",
    label: "Master Management",
    permissions: ["MANAGE_MASTER_DATA"],
  },
  {
    key: "erp-modules",
    label: "ERP modules",
    permissions: [
      ...ORGANIZATION_MODULE_ACCESS_PERMISSIONS,
      ...ORGANIZATION_SUBMODULE_ACCESS_PERMISSIONS,
    ],
  },
  {
    key: "orders",
    label: "Orders and reports",
    permissions: [
      "VIEW_ORDERS",
      "CREATE_ORDERS",
      "UPDATE_ORDERS",
      "DELETE_ORDERS",
      "SHARE_ORDERS",
      "APPROVE_ORDERS",
      "VIEW_REPORTS",
      ...ORDER_MANAGEMENT_ACTION_PERMISSIONS.filter((permission) => permission.startsWith("ORDER_MANAGEMENT:merchandising/")),
    ],
  },
  {
    key: "factory-production",
    label: "Factory production",
    permissions: [
      "VIEW_FACTORY_PRODUCTION",
      "UPDATE_FACTORY_PRODUCTION",
      "MANAGE_FACTORY_PRODUCTION",
      "VIEW_WORK_ORDERS",
      "CREATE_WORK_ORDERS",
      "UPDATE_WORK_ORDERS",
      "DELETE_WORK_ORDERS",
    ],
  },
  {
    key: "inventory",
    label: "Inventory and receiving",
    permissions: [
      "DELETE_GATE_ENTRIES",
      "VIEW_GATE_ENTRIES",
      "CREATE_GATE_ENTRIES",
      "DELETE_INVENTORY_RECEIPTS",
      "ADJUST_RAW_MATERIAL_STOCK",
      "VIEW_INVENTORY_STOCK",
      "CREATE_FINISHED_GOODS_STOCK",
      "ADJUST_FINISHED_GOODS_STOCK",
      "RESERVE_RAW_MATERIAL_STOCK",
      "REQUEST_RAW_MATERIAL_OUTWARD",
      "MANAGE_RAW_MATERIAL_OUTWARD",
      "REQUEST_FINISHED_GOODS_OUTWARD",
      "MANAGE_FINISHED_GOODS_OUTWARD",
      "VIEW_STORAGE_NODES",
      "MANAGE_STORAGE_NODES",
      "VIEW_INVENTORY_RECEIPTS",
      "MANAGE_INVENTORY_RECEIPTS",
    ],
  },
  {
    key: "point-of-sale",
    label: "Point of sale",
    permissions: [
      "CREATE_POS_SALES",
      "VIEW_POS_SALES",
      "VIEW_POS_COUNTERS",
      "CREATE_POS_COUNTERS",
      "CREATE_POS_SALES_RETURNS",
      "VIEW_POS_SALES_RETURNS",
      "SETTLE_POS_SALES_RETURN_REFUNDS",
      "VIEW_POS_OFFERS",
      "MANAGE_POS_OFFERS",
      "VIEW_POS_COUPONS",
      "MANAGE_POS_COUPONS",
      "VIEW_POS_PURCHASE_RECORDS",
      "MANAGE_POS_PURCHASE_RECORDS",
      "DELETE_POS_PURCHASE_RECORDS",
      "POST_POS_PURCHASE_BILLS",
      "VIEW_POS_ONLINE_STORE",
      "MANAGE_POS_ONLINE_STORE",
    ],
  },
  {
    key: "finance-management",
    label: "Finance management",
    permissions: [
      "SUBMIT_FINANCE_DOCUMENT",
      "MANAGE_FINANCE_INTEGRATIONS",
      "DISPATCH_FINANCE_SYNC",
      "CREATE_PROCUREMENT_VENDOR_BILL",
      "SUBMIT_PROCUREMENT_VENDOR_BILL",
      "APPROVE_PROCUREMENT_VENDOR_BILL",
      "POST_PROCUREMENT_VENDOR_BILL",
      "APPROVE_FINANCE_DOCUMENT",
      "POST_FINANCE_DOCUMENT",
      "LOCK_FINANCE_DOCUMENT",
      "CANCEL_FINANCE_DOCUMENT",
      "REVERSE_FINANCE_DOCUMENT",
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    permissions: [
      "VIEW_PURCHASE_ORDERS",
      "CREATE_PURCHASE_ORDERS",
      "UPDATE_PURCHASE_ORDERS",
      "DELETE_PURCHASE_ORDERS",
      "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL",
      "SHARE_PURCHASE_ORDERS",
      "APPROVE_PURCHASE_ORDERS",
      "REJECT_PURCHASE_ORDERS",
      ...ORDER_MANAGEMENT_ACTION_PERMISSIONS.filter((permission) => permission.startsWith("ORDER_MANAGEMENT:procurement/")),
    ],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  permissions: readonly OrganizationPermissionKey[];
}[];

export const ORGANIZATION_MODULE_PERMISSION_REQUIREMENTS: Readonly<Record<string, readonly OrganizationPermissionKey[]>> = {
  "order-management": [
    "VIEW_ORDERS",
    "CREATE_ORDERS",
    "UPDATE_ORDERS",
    "DELETE_ORDERS",
    "VIEW_PURCHASE_ORDERS",
    "CREATE_PURCHASE_ORDERS",
    "UPDATE_PURCHASE_ORDERS",
    "DELETE_PURCHASE_ORDERS",
  ],
  "factory-management": [
    "VIEW_FACTORY_PRODUCTION",
    "UPDATE_FACTORY_PRODUCTION",
    "MANAGE_FACTORY_PRODUCTION",
    "VIEW_WORK_ORDERS",
    "CREATE_WORK_ORDERS",
    "UPDATE_WORK_ORDERS",
    "DELETE_WORK_ORDERS",
  ],
  "inventory-management": [
    "VIEW_INVENTORY_STOCK",
    "ADJUST_RAW_MATERIAL_STOCK",
    "CREATE_FINISHED_GOODS_STOCK",
    "ADJUST_FINISHED_GOODS_STOCK",
    "VIEW_INVENTORY_RECEIPTS",
    "MANAGE_INVENTORY_RECEIPTS",
    "VIEW_STORAGE_NODES",
    "MANAGE_STORAGE_NODES",
    "REQUEST_RAW_MATERIAL_OUTWARD",
    "MANAGE_RAW_MATERIAL_OUTWARD",
    "REQUEST_FINISHED_GOODS_OUTWARD",
    "MANAGE_FINISHED_GOODS_OUTWARD",
  ],
  distribution: ["VIEW_ORDERS"],
  pos: [
    "VIEW_POS_SALES",
    "CREATE_POS_SALES",
    "VIEW_POS_COUNTERS",
    "CREATE_POS_COUNTERS",
    "VIEW_POS_SALES_RETURNS",
    "CREATE_POS_SALES_RETURNS",
    "VIEW_POS_PURCHASE_RECORDS",
    "MANAGE_POS_PURCHASE_RECORDS",
    "DELETE_POS_PURCHASE_RECORDS",
    "POST_POS_PURCHASE_BILLS",
    "VIEW_POS_OFFERS",
    "MANAGE_POS_OFFERS",
    "VIEW_POS_COUPONS",
    "MANAGE_POS_COUPONS",
    "VIEW_POS_ONLINE_STORE",
    "MANAGE_POS_ONLINE_STORE",
  ],
  "finance-management": ["VIEW_REPORTS"],
  "security-management": ["VIEW_GATE_ENTRIES", "CREATE_GATE_ENTRIES", "DELETE_GATE_ENTRIES"],
};

export function getOrganizationModuleAccessPermission(moduleKey: string) {
  return ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY[
    moduleKey as keyof typeof ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY
  ];
}

export function isOrganizationModuleAccessPermission(permission: string): permission is OrganizationModuleAccessPermission {
  return ORGANIZATION_MODULE_ACCESS_PERMISSIONS.includes(permission as typeof ORGANIZATION_MODULE_ACCESS_PERMISSIONS[number]);
}

export function getOrganizationSubmoduleAccessPermission(
  moduleKey: string,
  keyPath: readonly string[],
): OrganizationSubmoduleAccessPermission {
  return `ACCESS_SUBMODULE:${moduleKey}:${keyPath.join("/")}`;
}

export function isOrganizationSubmoduleAccessPermission(
  permission: string,
): permission is OrganizationSubmoduleAccessPermission {
  return ORGANIZATION_SUBMODULE_ACCESS_PERMISSIONS.includes(permission as OrganizationSubmoduleAccessPermission);
}

export function getOrganizationModuleNavigationAccessPermissions(moduleKey: string) {
  return flattenOrganizationModuleNavigation(getOrganizationModuleNavigationItems(moduleKey))
    .map(({ accessPermission }) => accessPermission);
}

export function getOrganizationOrderManagementNavigationPermissions(
  keyPath: readonly string[],
): OrganizationOrderManagementPermission[] {
  const resource = keyPath.join("/");
  return (["view", "create", "edit", "delete"] as const)
    .map((action) => getOrganizationOrderManagementPermission(
      resource as OrganizationOrderManagementResource,
      action,
    ))
    .filter((permission): permission is OrganizationOrderManagementPermission => Boolean(permission));
}

export function getOrganizationSubmoduleAccessPermissionForPath(
  pathname: string,
  organizationPath: string,
) {
  const matchingItems = ERP_MODULES.flatMap(({ key }) =>
    flattenOrganizationModuleNavigation(getOrganizationModuleNavigationItems(key))
      .map((item) => ({
        permission: item.accessPermission,
        path: `${organizationPath}${item.routePath}`,
      })),
  )
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((left, right) => right.path.length - left.path.length);

  return matchingItems[0]?.permission;
}

export function getLegacyOrganizationModuleAccessPermissions(
  effectivePermissions: readonly OrganizationPermissionKey[],
) {
  return ERP_MODULES.flatMap(({ key }) => {
    const requiredPermissions = ORGANIZATION_MODULE_PERMISSION_REQUIREMENTS[key];
    const wasPreviouslyAvailable = !requiredPermissions
      || requiredPermissions.some((permission) => effectivePermissions.includes(permission));
    const accessPermission = getOrganizationModuleAccessPermission(key);
    return wasPreviouslyAvailable && accessPermission ? [accessPermission] : [];
  });
}

export function getLegacyOrganizationModuleSubmoduleAccessPermissions(
  effectiveModulePermissions: readonly OrganizationPermissionKey[],
) {
  return ERP_MODULES.flatMap(({ key }) => {
    const moduleAccessPermission = getOrganizationModuleAccessPermission(key);
    if (!moduleAccessPermission || !effectiveModulePermissions.includes(moduleAccessPermission)) return [];
    return getOrganizationModuleNavigationAccessPermissions(key);
  });
}

export function getOrganizationRoutePermissionRequirements(moduleKey: string, pathname: string) {
  if (moduleKey === "order-management") {
    const navigationItems = flattenOrganizationModuleNavigation(
      getOrganizationModuleNavigationItems(moduleKey),
    );
    const matchingItem = navigationItems
      .filter(({ routePath }) => pathname.includes(routePath))
      .sort((left, right) => right.routePath.length - left.routePath.length)[0];
    if (matchingItem) {
      const permissions = getOrganizationOrderManagementNavigationPermissions(matchingItem.keyPath);
      if (permissions.length > 0) return permissions;
    }
    if (pathname.includes("/procurement")) {
      return pathname.includes("/create-po") || pathname.includes("/allocate-vendor")
        ? ["CREATE_PURCHASE_ORDERS", "VIEW_PURCHASE_ORDERS"] as const
        : ["VIEW_PURCHASE_ORDERS"] as const;
    }
    return pathname.includes("/bulk-order-creation") || pathname.endsWith("/order/new")
      ? ["CREATE_ORDERS", "VIEW_ORDERS"] as const
      : ["VIEW_ORDERS"] as const;
  }
  if (moduleKey === "factory-management") {
    return pathname.includes("/work-order")
      ? pathname.includes("/new") || pathname.includes("/create")
        ? ["CREATE_WORK_ORDERS", "VIEW_WORK_ORDERS"] as const
        : ["VIEW_WORK_ORDERS"] as const
      : ["VIEW_FACTORY_PRODUCTION"] as const;
  }
  if (moduleKey === "inventory-management") {
    return pathname.includes("/inward") || pathname.includes("/grn")
      ? ["VIEW_INVENTORY_RECEIPTS", "MANAGE_INVENTORY_RECEIPTS"] as const
      : pathname.includes("/storage")
        ? ["VIEW_STORAGE_NODES", "MANAGE_STORAGE_NODES"] as const
        : ["VIEW_INVENTORY_STOCK", "ADJUST_RAW_MATERIAL_STOCK", "CREATE_FINISHED_GOODS_STOCK", "ADJUST_FINISHED_GOODS_STOCK"] as const;
  }
  if (moduleKey === "pos") {
    if (pathname.includes("/counter")) return ["VIEW_POS_COUNTERS"] as const;
    if (pathname.includes("/offers")) return ["VIEW_POS_OFFERS", "MANAGE_POS_OFFERS"] as const;
    if (pathname.includes("/cupencode")) return ["VIEW_POS_COUPONS", "MANAGE_POS_COUPONS"] as const;
    if (pathname.includes("/purchase-bill")) return ["VIEW_POS_PURCHASE_RECORDS", "MANAGE_POS_PURCHASE_RECORDS", "POST_POS_PURCHASE_BILLS"] as const;
    if (pathname.includes("/online-store")) return ["VIEW_POS_ONLINE_STORE", "MANAGE_POS_ONLINE_STORE"] as const;
    if (pathname.includes("/sales-return")) return ["VIEW_POS_SALES_RETURNS", "CREATE_POS_SALES_RETURNS", "SETTLE_POS_SALES_RETURN_REFUNDS"] as const;
    if (pathname.includes("/stock")) return ["VIEW_INVENTORY_STOCK", "ADJUST_FINISHED_GOODS_STOCK"] as const;
    if (pathname.includes("/quick-invoice")) return ["CREATE_POS_SALES"] as const;
    if (pathname.includes("/invoice")) return ["VIEW_POS_SALES"] as const;
  }
  if (moduleKey === "security-management") {
    return ["VIEW_GATE_ENTRIES", "CREATE_GATE_ENTRIES", "DELETE_GATE_ENTRIES"] as const;
  }
  return ORGANIZATION_MODULE_PERMISSION_REQUIREMENTS[moduleKey] ?? [];
}

export function hasOrganizationModulePermission(moduleKey: string, effectivePermissions: readonly OrganizationPermissionKey[]) {
  const accessPermission = getOrganizationModuleAccessPermission(moduleKey);
  return accessPermission ? effectivePermissions.includes(accessPermission) : false;
}
