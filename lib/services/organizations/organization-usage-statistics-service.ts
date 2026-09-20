import { prisma } from "@/lib/database/prisma-client";

export type OrganizationUsageStatistic = {
  tableName: string;
  recordCount: number;
};

const organizationTableLabels: Record<string, string> = {
  memberships: "Organization memberships",
  taxProfiles: "Organization tax profiles",
  erpSoftware: "ERP software",
  masterModules: "Master modules",
  merchandisingOrders: "Merchandising orders",
  outgoingOrderShares: "Outgoing order shares",
  incomingOrderShares: "Incoming order shares",
  destinationOrderShares: "Destination order shares",
  approvalRequests: "Approval requests",
  masterEntities: "Entities",
  masterCategoryTypes: "Category types",
  masterCategories: "Categories",
  masterSubCategories: "Sub-categories",
  masterBrands: "Brands",
  masterPreOrderChecklists: "Pre-order checklists",
  masterCurrencyTypes: "Currency types",
  masterBuyers: "Buyers",
  masterSeasons: "Seasons",
  masterArticles: "Articles",
  masterGoldSeals: "Gold seals",
  masterGoldSealVariants: "Gold seal variants",
  masterColors: "Colors",
  masterSizeGroups: "Size groups",
  masterSizes: "Sizes",
  masterUoms: "Units of measure",
  masterStockUomConverts: "Stock UOM conversions",
  masterRawMaterials: "Raw materials",
  masterRawMaterialTypes: "Raw material types",
  masterRawMaterialCategories: "Raw material categories",
  masterRawMaterialSubCats: "Raw material sub-categories",
  masterVendors: "Vendors",
  masterStates: "States",
  masterGstTypes: "GST types",
  masterGsts: "GST records",
  masterHsns: "HSN records",
  masterMeasurementCharts: "Measurement charts",
  masterSizeWiseConsumptions: "Size-wise consumption templates",
  masterProducts: "Products",
  masterProcesses: "Processes",
  masterProcessTemplates: "Process templates",
  masterProcessTemplateSteps: "Process template steps",
  masterOperationTemplates: "Operation templates",
  masterOperationTemplateSteps: "Operation template steps",
  masterMerchandisers: "Merchandisers",
  masterStatuses: "Statuses",
  masterOrderVolumes: "Order volumes",
  groupedPurchaseOrders: "Grouped purchase orders",
  masterPurchaseOrders: "Master purchase orders",
  purchaseOrders: "Purchase orders",
  subscriptions: "Subscriptions",
  invitations: "Organization invitations",
  rolePermissions: "Role permissions",
  roleDefinitions: "Role definitions",
  supportTickets: "Support tickets",
  procurementDocumentCounters: "Procurement document counters",
  inventoryReceipts: "Inventory receipts",
  rawMaterialStocks: "Raw material stocks",
  finishedGoodsStocks: "Finished goods stocks",
  finishedGoodsSkuStocks: "Finished goods SKU stocks",
  gateEntries: "Gate entries",
  factoryWorkOrders: "Factory work orders",
  factoryProductionUpdates: "Factory production updates",
  factoryBundleTransfers: "Factory bundle transfers",
  factoryDailyProductionReports: "Factory daily production reports",
  factoryGrns: "Factory GRNs",
};

const organizationUsageCountSelect = Object.fromEntries(
  Object.keys(organizationTableLabels).map((key) => [key, true]),
) as Record<keyof typeof organizationTableLabels, true>;

export async function getOrganizationUsageStatistics(
  organizationId: string,
): Promise<OrganizationUsageStatistic[]> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      _count: {
        select: organizationUsageCountSelect,
      },
    },
  });

  if (!organization) {
    return [];
  }

  return Object.entries(organizationTableLabels).map(([key, tableName]) => ({
    tableName,
    recordCount: organization._count[key as keyof typeof organization._count],
  }));
}
