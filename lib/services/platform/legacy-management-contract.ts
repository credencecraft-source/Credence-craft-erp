export const LEGACY_MANAGEMENT_TASKS = [
  {
    id: "contact-address-state-from-tax-registration",
    name: "Backfill Contact Master GST State Codes",
    targetModule: "Contact Master",
  },
  {
    id: "contact-address-state-from-state-name",
    name: "Normalize Contact Address GST State Codes",
    targetModule: "Contact Master",
  },
  {
    id: "legacy-order-number-sequences",
    name: "Migrate Legacy Order Number Sequences",
    targetModule: "Order Counter",
  },
  {
    id: "legacy-order-variant-codes",
    name: "Backfill Persisted Order Variant Codes",
    targetModule: "Merchandising Orders",
  },
  {
    id: "legacy-article-variant-code-format",
    name: "Normalize Legacy Article Variant Codes",
    targetModule: "Article Variants",
  },
  {
    id: "legacy-finished-goods-identifiers",
    name: "Backfill Safe Finished-Goods SKU and Barcode Values",
    targetModule: "Finished Goods",
  },
  {
    id: "legacy-finished-goods-storage-nodes",
    name: "Map Unambiguous Finished-Goods Storage Locations",
    targetModule: "Finished Goods Stock",
  },
] as const;

export type LegacyManagementTaskId =
  (typeof LEGACY_MANAGEMENT_TASKS)[number]["id"];

export type LegacyManagementStatus =
  | "PENDING"
  | "DRY_RUN_PASSED"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export type LegacyManagementOrganization = {
  id: string;
  name: string;
};

export type LegacyManagementSampleChange = {
  subject: string;
  from: string;
  to: string;
};

export type LegacyManagementSampleSkip = {
  subject: string;
  reason: string;
};

export type LegacyManagementDryRunResult = {
  totalEligible: number;
  previouslyProcessed: number;
  sampleChanges: LegacyManagementSampleChange[];
  skippedCount: number;
  sampleSkips?: LegacyManagementSampleSkip[];
};

export type LegacyManagementExecutionResult = {
  processedCount: number;
  skippedCount: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  sampleSkips?: LegacyManagementSampleSkip[];
};

export type LegacyManagementTaskRefreshResult = LegacyManagementDryRunResult & {
  taskId: LegacyManagementTaskId;
  status: LegacyManagementStatus;
};
