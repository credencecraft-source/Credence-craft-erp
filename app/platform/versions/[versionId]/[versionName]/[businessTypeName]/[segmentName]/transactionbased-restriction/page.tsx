import Link from "next/link";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails } from "@/lib/services/platform/version-service";
import { listSegmentFormRestrictions, upsertSegmentFormRestriction } from "@/lib/services/platform/segment-form-restriction-service";

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toSegmentUrlSegment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getDatabaseTableMetadata() {
  const schemaDir = path.join(process.cwd(), "prisma", "schema");
  const schemaFiles = (await readdir(schemaDir)).filter((file) => file.endsWith(".prisma")).sort();
  const tables: Array<{ modelName: string; tableName: string; idField: string; purpose: string }> = [];

  const purposeMap: Record<string, string> = {
    WorkspaceUser: "Workspace login, profile, and user activity records used for authentication and workspace membership.",
    Organization: "Core tenant organization master data used to identify the business and its linked ERP configuration.",
    OrganizationMembership: "Link between a workspace user and an organization, controlling tenant access and roles.",
    OrganizationRolePermission: "Permission grants assigned to organization roles for access control across modules.",
    OrganizationRoleDefinition: "Named role definitions within an organization, used to group permissions and user access.",
    OrganizationInvitation: "Invitation workflow for inviting users into an organization or workspace.",
    WorkspaceNotification: "User notifications generated throughout the ERP process.",
    PlatformAdmin: "Platform-level administrators managing shared system settings and tenants.",
    PlatformEmailConfiguration: "Global email setup used for password resets, invites, and workflow notifications.",
    OtpChallenge: "One-time password challenge records for verification and secure login flows.",
    SupportTicket: "Support requests raised by users or organizations for troubleshooting and platform help.",
    AuditEvent: "System audit trails for critical business actions and compliance review.",
    BusinessType: "Business classification such as Order Management, Procurement, or Factory, used in plan and module logic.",
    Plan: "Subscription plan definition for an organization or segment, including pricing and plan metadata.",
    PlanFeature: "Feature-level access definition attached to a plan, controlling what a paid tier can use.",
    DatabaseConnection: "Tenant database connection details used to connect an organization to its ERP database.",
    ERPSoftware: "ERP product selection or integration mapping for the tenant.",
    ERPModule: "Reusable ERP module metadata such as modules and submodules shown in the left navigation.",
    ERPModuleData: "Module-specific configuration or data records used while rendering ERP functional areas.",
    MasterModule: "Master module registry that defines the available ERP business areas and action hierarchy.",
    MasterModuleValue: "Values inside a master module used to represent choices such as categories or entities.",
    MasterEntity: "Master entity definitions used across merchandising and order processes.",
    MasterCategoryType: "RM category type headers used for product and raw material grouping.",
    MasterCategory: "FG category master data used for finished goods classification.",
    MasterSubCategory: "FG sub-category data beneath FG categories for deeper classification.",
    MasterBrand: "Brand master data used in purchase, order, and merchandising flows.",
    MasterPreOrderChecklist: "Checklist records for pre-order validation and planning steps.",
    MasterCurrencyType: "Currency definitions used for purchasing, vendor pricing, and valuation.",
    MasterBuyer: "Buyer master data used to assign and track purchasing demand.",
    MasterSeason: "Season master data used in product planning and order creation.",
    MasterArticle: "Article master records used to define styles and merchandise SKUs.",
    MasterGoldSeal: "Gold seal master definitions for quality or finishing controls.",
    MasterGoldSealVariant: "Variant detail for gold seal configuration.",
    MasterColor: "Color master data used in style, stock, and order entries.",
    MasterSizeGroup: "Group of sizes used to define product size matrices.",
    MasterSize: "Individual size entries used across finished goods and BOM calculations.",
    MasterSizeGroupSize: "Join table between size groups and individual sizes.",
    MasterUom: "Units of measure used for quantities and stock conversions.",
    MasterStockUomConvert: "Conversion rules between stock units and buying units.",
    MasterVendor: "Vendor master list used for purchasing, procurement, and GRN flows.",
    MasterState: "State master records used for GST, addresses, and region mapping.",
    MasterGstType: "GST type classification used in tax calculation.",
    MasterGst: "GST rate master data by region or type.",
    MasterHsn: "HSN data used in purchase and sales tax compliance.",
    MasterMeasurementChart: "Measurement chart data for size and fit standards.",
    MasterSizeWiseConsumption: "Consumption rules by size used in BOM and production planning.",
    MasterProduct: "Product master data used in merchandising, buying, and stock flows.",
    MasterProcess: "Process master definitions such as cutting, sewing, washing, and finishing.",
    MasterProcessTemplate: "Reusable order process templates used to drive workflow execution.",
    MasterProcessTemplateStep: "Steps inside a process template, ordered as the actual workflow path.",
    MasterOperationTemplate: "Reusable operation definitions linked to a process.",
    MasterOperationTemplateStep: "Sequence of operations inside an operation template.",
    MasterMerchandiser: "Merchandiser master data used in order and planning ownership.",
    MasterStatus: "Standard status values used across ERP document lifecycles.",
    MasterOrderVolume: "Order volume or demand planning master records.",
    MasterRawMaterialType: "Classification of raw materials by type.",
    MasterRawMaterialCategory: "Raw material category hierarchy.",
    MasterRawMaterialSubCategory: "Raw material sub-category classification.",
    MasterRawMaterial: "Raw material master definitions such as fabric, trims, and packaging items.",
    ApprovalRequest: "Approval workflow records for documents or actions requiring authorized signoff.",
    OrderShare: "Order sharing between organizations or users for collaboration.",
    TicketMessage: "Messages inside support ticket discussions.",
    OrganizationOrderCounter: "Document number counters for organization-specific numbering.",
    MerchandisingOrder: "Main order record for merchandise planning and execution, including order details and stages.",
    MerchandisingOrderProcessStep: "Step-by-step process flow for a merchandising order.",
    MerchandisingOrderProcessOperation: "Operations within each process step for the order lifecycle.",
    OrderProcessController: "Controller that tracks the active order process template and execution state.",
    OrderProcessControllerProcess: "Process-level progress and quantity tracking for the order controller.",
    OrderProcessControllerOperation: "Operation-level task tracking for a process, including cost and quantity status.",
    FinishedGoodsSizeWise: "Finished goods size-wise quantities generated from the order for planning and production.",
    BillOfMaterialItem: "BOM lines mapping raw material items required by an order.",
    GroupedPurchaseOrder: "Grouped procurement document created across multiple order BOM items or styles.",
    MasterPurchaseOrder: "Master source purchase order for grouped procurement planning.",
    MasterPurchaseOrderSource: "Link between master POs and grouped POs used to track source data.",
    MasterPurchaseOrderLine: "Line-level detail within a master purchase order.",
    GroupedPurchaseOrderLine: "Grouped line details for procurement of BOM items.",
    Subscription: "Active subscription and payment status for a tenant plan on a business type.",
    PurchaseOrder: "Procurement order issued to vendor(s) for buying goods or raw materials.",
    PurchaseOrderSource: "Relation between purchase orders and a master purchase order source.",
    PurchaseOrderLine: "Detailed line items in a purchase order, including tax and quantity details.",
    PosPurchaseRecord: "Point-of-sale purchase record capturing item-level transactional data before billing.",
    PosPurchaseRecordLine: "Line items inside a POS purchase record.",
    PosPurchaseBill: "Purchase bill generated from POS purchase records for vendor billing.",
    PosPurchaseBillLine: "Bill lines including item amounts, taxes, and totals.",
    ProcurementDocumentCounter: "Sequential counters for procurement document numbers.",
    InventoryReceipt: "Receipt document for incoming material against a purchase order.",
    InventoryReceiptLine: "Line details for received material quantity and acceptance checks.",
    RawMaterialStock: "Current raw material stock balance by warehouse.",
    FinishedGoodsStock: "Finished goods stock balance by style/size/warehouse.",
    FinishedGoodsSkuStock: "SKU-level finished goods stock ledger with sales, purchases, and current inventory balance.",
    GateEntry: "Warehouse entry log for vehicle or material movement tracking and control.",
    FactoryWorkOrder: "Factory work order created from a merchandising order for production execution.",
    FactoryWorkOrderSizeLine: "Size-wise quantity breakdown within a factory work order.",
    FactoryWorkOrderBomLine: "BOM material requirements attached to a factory work order.",
    WorkOrderProcessController: "Controller linking a factory work order to the process flow and execution status.",
    WorkOrderProcessControllerProcess: "Process progress for a work order, including quantities and statuses.",
    WorkOrderProcessControllerOperation: "Operation-level execution detail within a factory process.",
    FactoryProductionUpdate: "Production progress updates posted by the factory against a work order and operation.",
    FactoryProductionUpdateSizeLine: "Size-wise quantities captured in a production update.",
    FactoryBundleTransfer: "Movement of production output between work order processes or stages.",
    FactoryBundleTransferSizeLine: "Size-wise quantities within a bundle transfer.",
    FactoryGrn: "Goods receipt note issued after a bundle transfer or process completion.",
    FactoryGrnLine: "Line items inside a GRN, including actual quantities and billability.",
    FactoryDailyProductionReport: "Daily summary report of production, transfers, receipts, and labor cost.",
    FactoryDailyProductionReportLine: "Detail lines inside the daily production report.",
    Segment: "Version segment such as FREE, CLASSIC, PREMIUM, used to define segment-specific plan configuration.",
    PlatformVersion: "Platform version catalog that groups business types and segments for a released ERP version.",
    VersionBusinessType: "Mapping between a platform version and a business type.",
    VersionBusinessTypeSegment: "Mapping of a version-business-type to a segment and its segment-level configuration.",
    VersionBusinessTypeTag: "Tags used for version business type classification.",
    VersionBusinessTypeSegmentTag: "Tags used for a specific version-business-type-segment assignment.",
    SegmentRestriction: "Segment-level restriction rules for blocking access to modules, actions, or routes based on plan/segment eligibility.",
  };

  for (const file of schemaFiles) {
    const fileContents = await readFile(path.join(schemaDir, file), "utf8");
    const modelBlocks = [...fileContents.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)];

    for (const match of modelBlocks) {
      const modelName = match[1];
      const modelBody = match[2];
      const mapMatch = modelBody.match(/@@map\(\s*"([^"]+)"\s*\)/);
      const tableName = mapMatch?.[1] ?? modelName;

      const idField = (() => {
        const fieldLineMatch = modelBody.match(/(^|\n)\s*([A-Za-z0-9_]+)\s+[^\n]*@id(?:\s|$)/m);
        if (fieldLineMatch?.[2]) return fieldLineMatch[2];

        const compositeMatch = modelBody.match(/@@id\(\s*\(\s*([A-Za-z0-9_\s,]+)\s*\)\s*\)/m);
        if (compositeMatch?.[1]) return compositeMatch[1].replace(/\s+/g, " ").trim();

        return "id";
      })();

      tables.push({
        modelName,
        tableName,
        idField,
        purpose: purposeMap[modelName] ?? "Business data table used in the ERP workflow for this model.",
      });
    }
  }

  return tables.sort((left, right) => left.tableName.localeCompare(right.tableName));
}

export default async function TransactionBasedRestrictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string; versionName: string; businessTypeName: string; segmentName: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { versionId, versionName, businessTypeName, segmentName } = await params;
  const query = (await searchParams) ?? {};
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => toUrlSegment(item.businessType.name) === businessTypeName);
  const assignment = entry?.segments.find((item) => toSegmentUrlSegment(item.segment.name) === segmentName);

  if (!version || !entry || !assignment) redirect(`/platform/versions/${versionId}`);

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}/transactionbased-restriction`;
  if (versionName !== toUrlSegment(version.version_name) || businessTypeName !== toUrlSegment(entry.businessType.name) || segmentName !== toSegmentUrlSegment(assignment.segment.name)) redirect(canonicalPath);

  const databaseTables = await getDatabaseTableMetadata();
  const segments = entry.segments.map(({ id, segment }) => ({ id, name: segment.name }));
  const formRestrictions = await listSegmentFormRestrictions(
    segments.map(({ id }) => id),
    databaseTables.map(({ tableName }) => tableName),
  );
  const formRestrictionByCell = new Map(
    formRestrictions.map((restriction) => [`${restriction.version_business_type_segment_id}:${restriction.form_key}`, restriction]),
  );
  const segmentPath = canonicalPath.replace("/transactionbased-restriction", "");

  async function saveEntryLimitAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const formKey = String(formData.get("formKey") || "").trim();
    const rawLimit = String(formData.get("monthlyEntryLimit") || "").trim();
    const segmentId = String(formData.get("segmentId") || "").trim();
    if (!segments.some((segment) => segment.id === segmentId) || !databaseTables.some((table) => table.tableName === formKey)) {
      redirect(`${canonicalPath}?error=${encodeURIComponent("The selected segment or table is invalid.")}`);
    }
    const existing = formRestrictions.find((restriction) => restriction.version_business_type_segment_id === segmentId && restriction.form_key === formKey);
    try {
      await upsertSegmentFormRestriction(segmentId, {
        formKey,
        monthlyQtyLimit: existing?.monthly_qty_limit ?? null,
        monthlyEntryLimit: rawLimit === "" ? null : Number(rawLimit),
        restrictedFields: existing?.restricted_fields ?? [],
      });
    } catch (error) {
      redirect(`${canonicalPath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save entry limit.")}`);
    }
    redirect(`${canonicalPath}?success=Entry%20limit%20saved.`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{version.version_name} / {entry.businessType.name} / {assignment.segment.name.toUpperCase()}</p>
            <h1 className="text-2xl font-bold text-slate-900">Transaction based restriction</h1>
            <p className="text-sm text-slate-600">Database tables, primary-key fields, and business purpose for the ERP transaction model.</p>
          </div>
          <Link href={segmentPath} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to restriction types</Link>
        </div>

        {query.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Database table reference</h2>
              <p className="mt-1 text-sm text-slate-500">Table names, identifier fields, and the business purpose of each model — no row records shown.</p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <Table>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-3">Model / Table</th>
                  <th className="px-3 py-3">Primary key field</th>
                  <th className="px-3 py-3">Purpose / usage</th>
                  {segments.map((segment) => <th key={segment.id} className="min-w-[170px] px-3 py-3 text-center">{segment.name.toUpperCase()}<span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-slate-400">Monthly entry limit</span></th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {databaseTables.length > 0 ? (
                  databaseTables.map((table) => (
                    <tr key={`${table.modelName}-${table.tableName}`}>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        <Link
                          href={`${canonicalPath}/${table.tableName}`}
                          className="text-emerald-700 hover:text-emerald-900 hover:underline"
                        >
                          {table.tableName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{table.idField}</td>
                      <td className="px-3 py-3 text-slate-600">{table.purpose}</td>
                      {segments.map((segment) => {
                        const restriction = formRestrictionByCell.get(`${segment.id}:${table.tableName}`);
                        return <td key={segment.id} className="px-3 py-3"><form action={saveEntryLimitAction} className="flex min-w-[155px] items-center gap-2"><input type="hidden" name="formKey" value={table.tableName} /><input type="hidden" name="segmentId" value={segment.id} /><input name="monthlyEntryLimit" type="number" min="0" step="1" defaultValue={restriction?.monthly_entry_limit ?? ""} placeholder="Unlimited" aria-label={`${table.tableName} limit for ${segment.name}`} className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800" /><button type="submit" className="rounded-md bg-emerald-600 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-700">Save</button></form></td>;
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3 + segments.length} className="px-3 py-8 text-center text-slate-500">
                      No database tables found.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
