"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  type MissingOrderMaster,
  type OrderMasterOption,
  type ParsedBulkOrderRow,
} from "./bulk-order-template";

type OrderResult = {
  spreadsheetRow: number;
  success: boolean;
  message: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MASTER_LABELS: Record<string, string> = {
  entity: "Entity",
  category: "Product Category",
  "sub-category": "Product Sub Category",
  season: "Season",
  article: "Article",
  color: "Color",
  buyer: "Buyer",
  brand: "Brand",
  "size-group": "Size Group",
};
const MASTER_CREATION_ORDER = ["entity", "season", "article", "color", "buyer", "brand", "category", "sub-category", "size-group"];
type MasterCreationChoice = { categoryType: string; parentCategory: string; brand: string; sizes: string[] };
type MasterCreationChoices = Record<string, MasterCreationChoice>;

function masterEntryKey(master: MissingOrderMaster) {
  return `${master.moduleKey}:${master.label.toLocaleLowerCase()}`;
}

function parseMasterOptions(value: unknown): Record<string, OrderMasterOption[]> {
  if (typeof value !== "object" || value === null || !("masterOptions" in value)
    || typeof value.masterOptions !== "object" || value.masterOptions === null) {
    throw new Error("The organization master lookup response was invalid.");
  }
  const result: Record<string, OrderMasterOption[]> = {};
  for (const [key, values] of Object.entries(value.masterOptions)) {
    if (!Array.isArray(values)) continue;
    result[key] = values.filter((option): option is OrderMasterOption =>
      typeof option === "object" && option !== null
      && "id" in option && typeof option.id === "string"
      && "value_id" in option && typeof option.value_id === "string"
      && "label" in option && typeof option.label === "string",
    );
  }
  return result;
}

function parseMasterOptionList(value: unknown): OrderMasterOption[] {
  if (!Array.isArray(value)) throw new Error("The organization master lookup response was invalid.");
  return value.filter((option): option is OrderMasterOption =>
    typeof option === "object" && option !== null
    && "id" in option && typeof option.id === "string"
    && "value_id" in option && typeof option.value_id === "string"
    && "label" in option && typeof option.label === "string",
  );
}

export default function BulkOrderCreationPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedBulkOrderRow[]>([]);
  const [results, setResults] = useState<OrderResult[]>([]);
  const [loadError, setLoadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showMasterApproval, setShowMasterApproval] = useState(false);
  const [missingMasters, setMissingMasters] = useState<MissingOrderMaster[]>([]);
  const [masterOptions, setMasterOptions] = useState<Record<string, OrderMasterOption[]>>({});
  const [masterChoices, setMasterChoices] = useState<MasterCreationChoices>({});
  const [createdMasterKeys, setCreatedMasterKeys] = useState<string[]>([]);
  const [masterCreationError, setMasterCreationError] = useState("");
  const [isCreatingMasters, setIsCreatingMasters] = useState(false);

  const validRows = rows.filter((row) => row.order !== null);
  const successfulCount = results.filter((result) => result.success).length;
  const failedResults = results.filter((result) => !result.success);

  const handleDownloadTemplate = async () => {
    if (!organizationId || isDownloadingTemplate) return;

    setDownloadError("");
    setIsDownloadingTemplate(true);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/order-lookups/template`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "Unable to create the organization-specific Excel template.";
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "bulk-order-template.xlsx";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to create the Excel template.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoadError("");
    setResults([]);
    setRows([]);
    setShowSummary(false);
    setShowMasterApproval(false);
    setMissingMasters([]);
    setCreatedMasterKeys([]);
    setMasterCreationError("");
    setFileName(file.name);
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setLoadError("Choose an .xlsx or .csv file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setLoadError("Files must be 10 MB or smaller.");
      return;
    }

    setIsParsing(true);
    try {
      const {
        findMissingOrderMasters,
        normalizeOrderMasterValues,
        parseBulkOrderFile,
      } = await import("./bulk-order-template");
      const parsedRows = await parseBulkOrderFile(file);
      if (parsedRows.length > 0) {
        const lookupResponse = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/master-data/order-lookups?includeInactive=false&limit=500`,
          { cache: "no-store" },
        );
        const lookupData: unknown = await lookupResponse.json().catch(() => null);
        if (!lookupResponse.ok) {
          throw new Error(
            typeof lookupData === "object" && lookupData !== null && "error" in lookupData && typeof lookupData.error === "string"
              ? lookupData.error
              : "Unable to check the organization master values.",
          );
        }
        const options = parseMasterOptions(lookupData);
        const normalizedRows = normalizeOrderMasterValues(parsedRows, options);
        const missing = findMissingOrderMasters(normalizedRows, options);
        if (missing.some((master) => master.moduleKey === "category")) {
          const productResponse = await fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/product-master?includeInactive=false&limit=200`,
            { cache: "no-store" },
          );
          const productData: unknown = await productResponse.json().catch(() => null);
          if (!productResponse.ok) {
            throw new Error("Unable to load Finished Goods Type values required for new categories.");
          }
          options["product-master"] = parseMasterOptionList(productData);
        }
        setMasterOptions(options);
        setMissingMasters(missing);
        setCreatedMasterKeys([]);
        setMasterCreationError("");
        const choices: MasterCreationChoices = {};
        for (const master of missing) {
          const entryKey = masterEntryKey(master);
          const relatedCategories = master.relatedLabels.category ?? [];
          const relatedBrands = master.relatedLabels.brand ?? [];
          const knownCategoryLabels = options.category?.map((option) => option.label) ?? [];
          const knownBrandLabels = options.brand?.map((option) => option.label) ?? [];
          const categoryChoices = [...new Set([...knownCategoryLabels, ...normalizedRows.flatMap((row) => {
            const order = row.order ?? row.candidateOrder;
            return order ? [order.category] : [];
          })])];
          const brandChoices = [...new Set([...knownBrandLabels, ...normalizedRows.flatMap((row) => {
            const order = row.order ?? row.candidateOrder;
            return order ? [order.brand] : [];
          })])];
          const categoryDefault = relatedCategories.length === 1
            ? relatedCategories[0]
            : categoryChoices.length === 1 ? categoryChoices[0] : "";
          const brandDefault = relatedBrands.length === 1
            ? relatedBrands[0]
            : brandChoices.length === 1 ? brandChoices[0] : "";
          choices[entryKey] = {
            categoryType: options["product-master"]?.length === 1 ? options["product-master"][0].label : "",
            parentCategory: categoryDefault,
            brand: brandDefault,
            sizes: [],
          };
        }
        setMasterChoices(choices);
        setShowMasterApproval(missing.length > 0);
        setRows(normalizedRows);
      } else {
        setRows(parsedRows);
      }
      if (parsedRows.length === 0) setLoadError("No order rows were found.");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to read the uploaded file.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

  const submitOrders = async () => {
    if (!organizationId || validRows.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setResults([]);
    setShowSummary(false);
    const orderResults: OrderResult[] = [];

    for (const row of rows) {
      if (!row.order) {
        orderResults.push({
          spreadsheetRow: row.spreadsheetRow,
          success: false,
          message: row.errors.join(" "),
        });
        setResults([...orderResults]);
        continue;
      }

      try {
        const response = await fetch(`/api/orders?organizationId=${encodeURIComponent(organizationId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row.order),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string" ? data.error : `Order API returned HTTP ${response.status}.`,
          );
        }
        orderResults.push({ spreadsheetRow: row.spreadsheetRow, success: true, message: "Order created." });
      } catch (error) {
        orderResults.push({
          spreadsheetRow: row.spreadsheetRow,
          success: false,
          message: error instanceof Error ? error.message : "Unable to create order.",
        });
      }
      setResults([...orderResults]);
    }

    setIsSubmitting(false);
    setShowSummary(true);
  };

  const handleSubmit = async () => {
    if (!organizationId || validRows.length === 0 || isSubmitting) return;
    if (missingMasters.length > 0) {
      setShowMasterApproval(true);
      return;
    }
    await submitOrders();
  };

  const updateMasterChoice = (master: MissingOrderMaster, update: Partial<MasterCreationChoice>) => {
    const entryKey = masterEntryKey(master);
    setMasterChoices((current) => ({
      ...current,
      [entryKey]: { ...current[entryKey], ...update },
    }));
  };

  const canCreateMissingMasters = missingMasters.every((master) => {
    const choice = masterChoices[masterEntryKey(master)];
    if (!choice) return false;
    if (master.moduleKey === "category") return Boolean(choice.categoryType);
    if (master.moduleKey === "sub-category") return Boolean(choice.parentCategory);
    if (master.moduleKey === "size-group") return Boolean(choice.brand) && choice.sizes.length > 0;
    return true;
  });

  const handleApproveMasterCreation = async () => {
    if (!organizationId || !canCreateMissingMasters || isCreatingMasters || isSubmitting) return;
    setIsCreatingMasters(true);
    setMasterCreationError("");
    const completedKeys = new Set(createdMasterKeys);
    try {
      for (const moduleKey of MASTER_CREATION_ORDER) {
        for (const master of missingMasters.filter((item) => item.moduleKey === moduleKey)) {
          const entryKey = masterEntryKey(master);
          if (completedKeys.has(entryKey)) continue;
          const choice = masterChoices[entryKey];
          let fields: Record<string, string | string[]> = {};
          switch (master.moduleKey) {
            case "entity":
              fields = { entity_name: master.label };
              break;
            case "season":
              fields = { season: master.label };
              break;
            case "article":
              fields = { article: master.label };
              break;
            case "color":
              fields = { Colors: master.label };
              break;
            case "buyer":
              fields = { Buyer_Name: master.label };
              break;
            case "brand":
              fields = { Brand: master.label };
              break;
            case "category":
              fields = { Product_Master: choice.categoryType, Category_Name: master.label };
              break;
            case "sub-category":
              fields = { category: choice.parentCategory, sub_category: master.label };
              break;
            case "size-group":
              fields = { Brand1: choice.brand, Size_Group: master.label, Size: choice.sizes };
              break;
            default:
              throw new Error(`Automatic creation is not configured for ${MASTER_LABELS[master.moduleKey] ?? master.moduleKey}.`);
          }

          const response = await fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(master.moduleKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: master.label, fields, createOnly: true }),
            },
          );
          const data: unknown = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
                ? `${MASTER_LABELS[master.moduleKey]} "${master.label}": ${data.error}`
                : `Unable to create ${MASTER_LABELS[master.moduleKey]} "${master.label}".`,
            );
          }
          completedKeys.add(entryKey);
          setCreatedMasterKeys([...completedKeys]);
        }
      }
      setMissingMasters([]);
      setShowMasterApproval(false);
      await submitOrders();
    } catch (error) {
      setMasterCreationError(error instanceof Error ? error.message : "Unable to create the missing organization masters.");
    } finally {
      setIsCreatingMasters(false);
    }
  };

  const handleClear = () => {
    setFileName("");
    setRows([]);
    setResults([]);
    setLoadError("");
    setShowSummary(false);
    setShowMasterApproval(false);
    setMissingMasters([]);
    setMasterOptions({});
    setMasterChoices({});
    setCreatedMasterKeys([]);
    setMasterCreationError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merchandising</p>
        <h1 className="text-2xl font-bold text-slate-900">Bulk Order Creation</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Upload a filled template to create standard orders one at a time. Every order uses the normal order API and its organization, plan, BOM, and validation checks.
        </p>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="max-w-3xl">
          <h2 className="text-sm font-semibold text-slate-900">Prepare your spreadsheet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use the single Orders sheet to enter one order per row. Finished Goods quantities and BOM details can be uploaded separately later. Choose the Delivery Date from the date-formatted field.
          </p>
          <p className="mt-1 text-xs text-slate-500">The template has no sample order, quantity, Finished Goods BOM, or separate detail sheets. CSV remains supported. Upload up to 500 orders per batch.</p>
        </div>
        <Button type="button" variant="secondary" onClick={handleDownloadTemplate} disabled={isDownloadingTemplate}>
          {isDownloadingTemplate
            ? <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
            : <Download aria-hidden="true" className="mr-2 h-4 w-4" />}
          {isDownloadingTemplate ? "Loading organization masters..." : "Download Excel Template"}
        </Button>
      </section>
      {downloadError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{downloadError}</p>}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* The shared button triggers this hidden native picker. */}
          {/* eslint-disable-next-line local/no-raw-ui-controls */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Upload an Excel or CSV order file"
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isParsing || isSubmitting}>
            {isParsing ? <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="mr-2 h-4 w-4" />}
            {isParsing ? "Reading file..." : "Upload Excel / CSV"}
          </Button>
          {fileName && <span className="inline-flex items-center gap-2 text-sm text-slate-600"><FileSpreadsheet aria-hidden="true" className="h-4 w-4" />{fileName}</span>}
          {rows.length > 0 && (
            <Button type="button" variant="ghost" onClick={handleClear} disabled={isSubmitting}>Clear</Button>
          )}
        </div>

        {loadError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>}
        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-700" aria-live="polite">
                {rows.length} order rows loaded · {validRows.length} ready · {rows.length - validRows.length} need correction
              </p>
              <Button type="button" onClick={handleSubmit} disabled={validRows.length === 0 || isSubmitting}>
                {isSubmitting && <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? `Submitting ${results.length} / ${rows.length}...` : `Create ${rows.length} orders`}
              </Button>
            </div>

            <div className="max-h-[65vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1500px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 p-3">Spreadsheet Row</th>
                    <th className="border-b border-slate-200 p-3">Entity</th>
                    <th className="border-b border-slate-200 p-3">Article / Style</th>
                    <th className="border-b border-slate-200 p-3">Category</th>
                    <th className="border-b border-slate-200 p-3">Season</th>
                    <th className="border-b border-slate-200 p-3">Colors</th>
                    <th className="border-b border-slate-200 p-3">Buyer / Brand</th>
                    <th className="border-b border-slate-200 p-3">Size Group</th>
                    <th className="border-b border-slate-200 p-3">Sizes / Qty</th>
                    <th className="border-b border-slate-200 p-3">Quantity</th>
                    <th className="border-b border-slate-200 p-3">BOM Materials</th>
                    <th className="border-b border-slate-200 p-3">Delivery Date</th>
                    <th className="border-b border-slate-200 p-3">Validation / Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const result = results.find((item) => item.spreadsheetRow === row.spreadsheetRow);
                    const order = row.order;
                    return (
                      <tr key={row.spreadsheetRow} className={row.errors.length > 0 || result?.success === false ? "bg-rose-50/60" : ""}>
                        <td className="p-3">{row.spreadsheetRow}</td>
                        <td className="p-3">{order?.entityName ?? "—"}</td>
                        <td className="p-3">{order ? `${order.article} / ${order.styleName}` : "—"}</td>
                        <td className="p-3">{order ? `${order.category} / ${order.subCategory}` : "—"}</td>
                        <td className="p-3">{order?.season ?? "—"}</td>
                        <td className="p-3">{order?.colors ?? "—"}</td>
                        <td className="p-3">{order ? `${order.buyer} / ${order.brand}` : "—"}</td>
                        <td className="p-3">{order?.sizeGroup ?? "—"}</td>
                        <td className="p-3">{order?.rows?.map((item) => `${item.size}:${item.beforeExcessQty} (+${item.excess ?? 0}%)`).join("; ") || "Upload later"}</td>
                        <td className="p-3">{order?.orderQty ?? "Upload later"}</td>
                        <td className="p-3">{order?.bomRows.length ?? "—"}</td>
                        <td className="p-3">{order?.deliveryDate ?? "—"}</td>
                        <td className="max-w-md whitespace-normal p-3">
                          {result ? (
                            <span className={result.success ? "text-emerald-700" : "text-rose-700"}>
                              {result.success ? "Created" : result.message}
                            </span>
                          ) : row.errors.length > 0 ? (
                            <span className="text-rose-700">{row.errors.join(" ")}</span>
                          ) : (
                            <span className="text-emerald-700">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Modal
        open={showMasterApproval}
        onClose={() => {
          if (!isCreatingMasters) setShowMasterApproval(false);
        }}
        ariaLabelledBy="bulk-order-missing-masters-title"
        size="xl"
        closeOnBackdrop={!isCreatingMasters}
      >
        <div className="space-y-5 p-6">
          <div>
            <h2 id="bulk-order-missing-masters-title" className="text-lg font-semibold text-slate-900">
              Create missing organization masters?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              These values are not in the organization&apos;s master data. Approve creation before the uploaded orders are submitted. Master creation uses the existing organization master workflow.
            </p>
          </div>

          <div className="max-h-[45vh] space-y-4 overflow-x-hidden overflow-y-auto rounded-lg border border-slate-200 p-4">
            {missingMasters.map((master) => {
              const key = masterEntryKey(master);
              const choice = masterChoices[key];
              const categories = [...new Set([
                ...(masterOptions.category ?? []).map((option) => option.label),
                ...rows.flatMap((row) => {
                  const order = row.order ?? row.candidateOrder;
                  return order ? [order.category] : [];
                }),
              ])];
              const brands = [...new Set([
                ...(masterOptions.brand ?? []).map((option) => option.label),
                ...rows.flatMap((row) => {
                  const order = row.order ?? row.candidateOrder;
                  return order ? [order.brand] : [];
                }),
              ])];
              const sizes = [...new Set((masterOptions.size ?? []).map((option) => option.label))];
              const productTypes = (masterOptions["product-master"] ?? []).map((option) => option.label);

              return (
                <div key={key} className="grid gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0 md:grid-cols-[minmax(12rem,1fr)_minmax(15rem,2fr)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{MASTER_LABELS[master.moduleKey]}</p>
                    <p className="break-words text-sm font-medium text-slate-900">{master.label}</p>
                    {createdMasterKeys.includes(key) && <p className="text-xs text-emerald-700">Created</p>}
                  </div>
                  <div className="space-y-3">
                    {master.moduleKey === "category" && choice && (
                      <Select
                        label="Finished Goods Type"
                        value={choice.categoryType}
                        onChange={(event) => updateMasterChoice(master, { categoryType: event.target.value })}
                        options={[
                          { label: "Choose a Finished Goods Type", value: "" },
                          ...productTypes.map((label) => ({ label, value: label })),
                        ]}
                        hint={productTypes.length > 0
                          ? undefined
                          : "Create a Finished Goods Type in Master Data before approving this category."}
                        disabled={isCreatingMasters || createdMasterKeys.includes(key)}
                      />
                    )}
                    {master.moduleKey === "sub-category" && choice && (
                      <Select
                        label="Parent Product Category"
                        value={choice.parentCategory}
                        onChange={(event) => updateMasterChoice(master, { parentCategory: event.target.value })}
                        options={[
                          { label: "Choose a Product Category", value: "" },
                          ...categories.map((label) => ({ label, value: label })),
                        ]}
                        hint={categories.length > 0
                          ? undefined
                          : "Create a Product Category in this upload or in Master Data before approving this subcategory."}
                        disabled={isCreatingMasters || createdMasterKeys.includes(key)}
                      />
                    )}
                    {master.moduleKey === "size-group" && choice && (
                      <>
                        <Select
                          label="Brand"
                          value={choice.brand}
                          onChange={(event) => updateMasterChoice(master, { brand: event.target.value })}
                          options={[
                            { label: "Choose a Brand", value: "" },
                            ...brands.map((label) => ({ label, value: label })),
                          ]}
                          hint={brands.length > 0
                            ? undefined
                            : "Create a Brand in this upload or in Master Data before approving this Size Group."}
                          disabled={isCreatingMasters || createdMasterKeys.includes(key)}
                        />
                        <Select
                          label="Sizes in this Size Group"
                          multiple
                          size={Math.min(Math.max(sizes.length, 3), 6)}
                          value={choice.sizes}
                          onChange={(event) => updateMasterChoice(master, {
                            sizes: Array.from(event.target.selectedOptions, (option) => option.value),
                          })}
                          options={sizes.map((label) => ({ label, value: label }))}
                          hint={sizes.length > 0
                            ? "Select the existing organization sizes that belong to this group."
                            : "No size master values are available. Add sizes in Master Data before creating this Size Group."}
                          disabled={isCreatingMasters || createdMasterKeys.includes(key) || sizes.length === 0}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {masterCreationError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {masterCreationError} No orders were submitted. Any masters already created remain in the organization.
            </p>
          )}
          {createdMasterKeys.length > 0 && (
            <p className="text-xs text-slate-600">
              {createdMasterKeys.length} of {missingMasters.length} missing masters have already been created. They will not be created twice if you retry.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowMasterApproval(false)}
              disabled={isCreatingMasters}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApproveMasterCreation}
              disabled={!canCreateMissingMasters || isCreatingMasters || isSubmitting}
            >
              {isCreatingMasters && <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              {isCreatingMasters ? "Creating masters..." : "Approve master creation and create orders"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showSummary}
        onClose={() => setShowSummary(false)}
        ariaLabelledBy="bulk-order-summary-title"
        size="lg"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="bulk-order-summary-title" className="text-lg font-semibold text-slate-900">Bulk order results</h2>
            <p className="mt-1 text-sm text-slate-600">
              Successfully created {successfulCount} {successfulCount === 1 ? "order" : "orders"}; {failedResults.length} failed.
            </p>
          </div>
          {failedResults.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-rose-100 bg-rose-50 p-3">
              {failedResults.map((result) => (
                <p key={result.spreadsheetRow} className="text-sm text-rose-800">
                  Row {result.spreadsheetRow}: {result.message}
                </p>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="button" onClick={() => setShowSummary(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
