"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { ReportGrid } from "@/components/reports/report-grid-display";

type LookupOption = {
  id: string;
  label: string;
  parent_id?: string | null;
  fields?: Record<string, unknown>;
  sizes?: Array<LookupOption | string>;
};
type BillLine = {
  id: string;
  itemName: string;
  size: string;
  quantity: string;
  purchasePrice: string;
  salesPrice: string;
  gstId: string;
  hsnCode: string;
};

type SavedPurchaseRecord = {
  id: string;
  recordNumber?: string;
  itemType: "FINISHED_GOODS" | "RAW_MATERIAL";
  styleName: string;
  brandId: string;
  sizeGroupId: string;
  colorId: string;
  categoryId: string;
  subCategoryId: string;
  lines: BillLine[];
  savedAt: string;
};

type PurchaseRecordReportRow = {
  id: string;
  record: string;
  itemType: string;
  style: string;
  sizeGroup: string;
  sizeCount: string;
  totalQuantity: string;
  savedAt: string;
};

const newLine = (): BillLine => ({
  id: crypto.randomUUID(),
  itemName: "",
  size: "",
  quantity: "",
  purchasePrice: "",
  salesPrice: "",
  gstId: "",
  hsnCode: "",
});

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export default function PurchaseBillEntryPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const router = useRouter();
  const [vendors, setVendors] = useState<LookupOption[]>([]);
  const [gsts, setGsts] = useState<LookupOption[]>([]);
  const [hsns, setHsns] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [sizeGroups, setSizeGroups] = useState<LookupOption[]>([]);
  const [colors, setColors] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [subCategories, setSubCategories] = useState<LookupOption[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [itemType, setItemType] = useState<"FINISHED_GOODS" | "RAW_MATERIAL">(
    "FINISHED_GOODS",
  );
  const [styleName, setStyleName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [sizeGroupId, setSizeGroupId] = useState("");
  const [colorId, setColorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [taxMode, setTaxMode] = useState<"LOCAL" | "INTERSTATE">("LOCAL");
  const [lines, setLines] = useState<BillLine[]>([newLine()]);
  const [savedRecords, setSavedRecords] = useState<SavedPurchaseRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [visibleReviewFields, setVisibleReviewFields] = useState<string[]>([
    "record",
    "itemType",
    "style",
    "sizeGroup",
    "sizeCount",
    "totalQuantity",
    "savedAt",
  ]);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [recordSuccessNumber, setRecordSuccessNumber] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const load = async (moduleKey: string) => {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${moduleKey}?includeInactive=false`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Unable to load master data.");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    };
    Promise.all([
      load("vendor"),
      load("gst"),
      load("hsn"),
      load("brand"),
      load("size-group"),
      load("color"),
      load("category"),
      load("sub-category"),
    ])
      .then(
        ([
          vendorData,
          gstData,
          hsnData,
          brandData,
          sizeGroupData,
          colorData,
          categoryData,
          subCategoryData,
        ]) => {
          setVendors(vendorData);
          setGsts(gstData);
          setHsns(hsnData);
          setBrands(brandData);
          setSizeGroups(sizeGroupData);
          setColors(colorData);
          setCategories(categoryData);
          setSubCategories(subCategoryData);
        },
      )
      .catch(() =>
        setMessage(
          "Unable to load vendor, GST, HSN, product, or size masters.",
        ),
      );
  }, [organizationId]);

  useEffect(() => {
    fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          records?: SavedPurchaseRecord[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            data.error || "Unable to load saved purchase records.",
          );
        setSavedRecords(Array.isArray(data.records) ? data.records : []);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load saved purchase records.",
        ),
      );
  }, [organizationId]);

  const updateLine = (id: string, key: keyof BillLine, value: string) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [key]: value } : line,
      ),
    );
  };

  const selectSizeGroup = (value: string) => {
    setSizeGroupId(value);
    if (itemType !== "FINISHED_GOODS") return;
    const group = sizeGroups.find(
      (option) => option.id === value || option.label === value,
    );
    const sizes = Array.isArray(group?.sizes)
      ? group.sizes
          .map((size: LookupOption | string) =>
            typeof size === "string" ? size : size.label,
          )
          .filter(Boolean)
      : [];
    setLines(
      sizes.length
        ? sizes.map((size) => ({ ...newLine(), size }))
        : [newLine()],
    );
  };

  const availableSubCategories = subCategories.filter(
    (subCategory) => !categoryId || subCategory.parent_id === categoryId,
  );
  const totalQuantity = lines.reduce(
    (total, line) => total + numberValue(line.quantity),
    0,
  );
  const stepOneReady =
    itemType === "RAW_MATERIAL"
      ? Boolean(lines[0]?.itemName.trim())
      : Boolean(
          styleName.trim() &&
          brandId &&
          sizeGroupId &&
          colorId &&
          categoryId &&
          subCategoryId &&
          lines.length > 0 &&
          lines.every((line) => line.quantity),
        );
  const billLines = savedRecords.flatMap((record) => record.lines);
  const groupedBillLines = useMemo(
    () =>
      savedRecords.map((record) => {
        const totalQuantity = record.lines.reduce(
          (total, line) => total + numberValue(line.quantity),
          0,
        );
        const weightedPrice = (key: "purchasePrice" | "salesPrice") => {
          if (totalQuantity === 0) return "";
          const total = record.lines.reduce(
            (sum, line) =>
              sum + numberValue(line.quantity) * numberValue(line[key]),
            0,
          );
          return (total / totalQuantity).toFixed(2);
        };
        const firstLine = record.lines[0];
        const gstId = record.lines.every(
          (line) => line.gstId === firstLine?.gstId,
        )
          ? (firstLine?.gstId ?? "")
          : "";
        const hsnCode = record.lines.every(
          (line) => line.hsnCode === firstLine?.hsnCode,
        )
          ? (firstLine?.hsnCode ?? "")
          : "";
        const sizeGroup =
          sizeGroups.find((option) => option.id === record.sizeGroupId)
            ?.label ?? record.sizeGroupId;
        return {
          id: record.id,
          itemName: record.styleName || firstLine?.itemName || "",
          size: sizeGroup || "Purchase group",
          quantity: String(totalQuantity),
          purchasePrice: weightedPrice("purchasePrice"),
          salesPrice: weightedPrice("salesPrice"),
          gstId,
          hsnCode,
        } satisfies BillLine;
      }),
    [savedRecords, sizeGroups],
  );

  const totals = useMemo(
    () =>
      billLines.reduce(
        (summary, line) => {
          const taxable =
            numberValue(line.quantity) * numberValue(line.purchasePrice);
          const gst = gsts.find((option) => option.id === line.gstId);
          const rate = numberValue(
            String(gst?.fields?.Gst ?? gst?.fields?.gst ?? 0),
          );
          const tax = (taxable * rate) / 100;
          if (taxMode === "INTERSTATE") summary.igst += tax;
          else {
            summary.cgst += tax / 2;
            summary.sgst += tax / 2;
          }
          summary.subtotal += taxable;
          return summary;
        },
        { subtotal: 0, cgst: 0, sgst: 0, igst: 0 },
      ),
    [billLines, gsts, taxMode],
  );

  const saveBill = async () => {
    if (posting) return;
    if (!vendorId || savedRecords.length === 0) {
      setMessage(
        "Vendor and saved records are required before posting the bill.",
      );
      return;
    }
    setPosting(true);
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorId,
            billNumber,
            billDate,
            taxMode,
            recordIds: savedRecords.map((record) => record.id),
          }),
        },
      );
      const data = (await response.json()) as {
        bill?: { documentNumber?: string; billNumber?: string };
        error?: string;
      };
      if (!response.ok) {
        setMessage(data.error || "Unable to post purchase bill.");
        return;
      }
      const documentNumber = data.bill?.documentNumber ?? "the purchase bill";
      setSavedRecords([]);
      setSelectedRecordIds([]);
      setLines([newLine()]);
      setStep(1);
      router.push(
        `${base}/pos/purchase-bill?success=${encodeURIComponent(`Purchase bill ${documentNumber} posted successfully.`)}&documentNumber=${encodeURIComponent(documentNumber)}`,
      );
    } catch {
      setMessage(
        "Unable to post purchase bill. Check your connection and try again.",
      );
    } finally {
      setPosting(false);
    }
  };

  const recordRows: PurchaseRecordReportRow[] = savedRecords.map((record) => {
    const recordQuantity = record.lines.reduce(
      (total, line) => total + numberValue(line.quantity),
      0,
    );
    const sizeGroup =
      sizeGroups.find((option) => option.id === record.sizeGroupId)?.label ??
      record.sizeGroupId;
    return {
      id: record.id,
      record: record.recordNumber ?? "Pending number",
      itemType:
        record.itemType === "FINISHED_GOODS"
          ? "Finished Goods"
          : "Raw Material",
      style: record.styleName || record.lines[0]?.itemName || "-",
      sizeGroup: sizeGroup || "-",
      sizeCount: String(record.lines.length),
      totalQuantity: String(recordQuantity),
      savedAt: new Date(record.savedAt).toLocaleString(),
    };
  });

  const recordFields = [
    { key: "record", label: "Record" },
    { key: "itemType", label: "Item Type" },
    { key: "style", label: "Style / Material" },
    { key: "sizeGroup", label: "Size Group" },
    { key: "sizeCount", label: "Size Rows" },
    { key: "totalQuantity", label: "Total Quantity" },
    { key: "savedAt", label: "Saved At" },
  ];

  const resetForNextRecord = (notice = "") => {
    setLines([newLine()]);
    setStyleName("");
    setBrandId("");
    setSizeGroupId("");
    setColorId("");
    setCategoryId("");
    setSubCategoryId("");
    setMessage(notice);
    setStep(1);
  };

  const openSavedRecord = (recordId: string) => {
    router.push(
      `${base}/pos/purchase-bill/records/${encodeURIComponent(recordId)}`,
    );
  };

  const saveStageOneRecord = async () => {
    if (!stepOneReady) {
      setMessage(
        itemType === "FINISHED_GOODS"
          ? "Select brand, style, color, category, subcategory, size group, and enter each size quantity."
          : "Enter a raw material and quantity.",
      );
      return;
    }
    const nextRecord: SavedPurchaseRecord = {
      id: crypto.randomUUID(),
      itemType,
      styleName,
      brandId,
      sizeGroupId,
      colorId,
      categoryId,
      subCategoryId,
      lines: lines.map((line) => ({ ...line })),
      savedAt: new Date().toISOString(),
    };
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextRecord),
      },
    );
    const data = (await response.json()) as {
      record?: SavedPurchaseRecord;
      error?: string;
    };
    if (!response.ok || !data.record) {
      setMessage(data.error || "Unable to save purchase record.");
      return;
    }
    setSavedRecords((current) => [...current, data.record!]);
    resetForNextRecord();
    setRecordSuccessNumber(data.record.recordNumber ?? "");
  };

  const continueToBillDetails = () => {
    if (savedRecords.length === 0) {
      setMessage("Save at least one record before continuing to bill details.");
      return;
    }
    setLines(groupedBillLines.map((line) => ({ ...line })));
    setStep(3);
  };

  const deleteSelectedRecords = async () => {
    if (selectedRecordIds.length === 0) return;
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: selectedRecordIds }),
      },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error || "Unable to delete purchase records.");
      return;
    }
    setSavedRecords((current) =>
      current.filter((record) => !selectedRecordIds.includes(record.id)),
    );
    setSelectedRecordIds([]);
    setMessage("Selected records deleted successfully.");
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link
              href={`${base}/pos`}
              className="text-xs font-semibold text-emerald-700"
            >
              &larr; POS
            </Link>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Purchase entry
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Create Purchase Bill
            </h1>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setLines([newLine()]);
              setStep(1);
              setMessage("");
            }}
          >
            Clear
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            "Purchase Items",
            "Purchase Item Grouped in Subform (Purchase Items)",
            "Purchase Bill in Subform (Purchase Grouped)",
          ].map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(number as 1 | 2 | 3)}
                className={`border-b-2 px-2 pb-2 text-center text-xs font-bold ${step === number ? "border-emerald-600 text-emerald-700" : step > number ? "border-emerald-200 text-emerald-500" : "border-slate-200 text-slate-400"}`}
              >
                Stage {number}
                <span className="mt-1 block font-medium">{label}</span>
              </button>
            );
          })}
        </div>
        {message && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {message}
          </p>
        )}

        {step === 1 && (
          <>
            <Card className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Stage 1
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Purchase Items
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Purchase item header and size-wise item subform.
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                    Total quantity
                  </p>
                  <p className="mt-1 text-3xl font-extrabold leading-none text-emerald-900">
                    {totalQuantity}
                  </p>
                </div>
              </div>
              <div
                className="flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm"
                role="group"
                aria-label="Purchase type"
              >
                <button
                  type="button"
                  onClick={() => setItemType("FINISHED_GOODS")}
                  aria-pressed={itemType === "FINISHED_GOODS"}
                  className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold ${itemType === "FINISHED_GOODS" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Finished Goods
                </button>
                <button
                  type="button"
                  onClick={() => setItemType("RAW_MATERIAL")}
                  aria-pressed={itemType === "RAW_MATERIAL"}
                  className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold ${itemType === "RAW_MATERIAL" ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  Raw Material
                </button>
              </div>
              {itemType === "FINISHED_GOODS" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Brand lookup
                    <select
                      value={brandId}
                      onChange={(event) => setBrandId(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Select brand</option>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Style name
                    <input
                      value={styleName}
                      onChange={(event) => setStyleName(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                      placeholder="Enter style name"
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Size group lookup
                    <select
                      value={sizeGroupId}
                      onChange={(event) => selectSizeGroup(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Select size group</option>
                      {sizeGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <label className="block max-w-md text-sm font-semibold text-slate-700">
                  Raw material
                  <input
                    value={lines[0]?.itemName ?? ""}
                    onChange={(event) =>
                      updateLine(
                        lines[0]?.id ?? "",
                        "itemName",
                        event.target.value,
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                    placeholder="Enter raw material"
                  />
                </label>
              )}
              {itemType === "FINISHED_GOODS" && (
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Color lookup
                    <select
                      value={colorId}
                      onChange={(event) => setColorId(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Select color</option>
                      {colors.map((color) => (
                        <option key={color.id} value={color.id}>
                          {color.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Product category
                    <select
                      value={categoryId}
                      onChange={(event) => {
                        setCategoryId(event.target.value);
                        setSubCategoryId("");
                      }}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Product subcategory
                    <select
                      value={subCategoryId}
                      onChange={(event) => setSubCategoryId(event.target.value)}
                      disabled={!categoryId}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Select subcategory</option>
                      {availableSubCategories.map((subCategory) => (
                        <option key={subCategory.id} value={subCategory.id}>
                          {subCategory.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        {itemType === "FINISHED_GOODS"
                          ? "Related size"
                          : "Raw material"}
                      </th>
                      <th className="px-4 py-3">Quantity</th>
                      <th className="px-4 py-3">Purchase price</th>
                      <th className="px-4 py-3">Sales price</th>
                      <th className="px-4 py-3">GST lookup</th>
                      <th className="px-4 py-3">HSN lookup</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {itemType === "FINISHED_GOODS"
                            ? line.size
                            : line.itemName}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(
                                line.id,
                                "quantity",
                                event.target.value,
                              )
                            }
                            className="w-28 rounded border border-slate-300 px-3 py-2"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.purchasePrice}
                            onChange={(event) =>
                              updateLine(
                                line.id,
                                "purchasePrice",
                                event.target.value,
                              )
                            }
                            className="w-32 rounded border border-slate-300 px-3 py-2"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.salesPrice}
                            onChange={(event) =>
                              updateLine(
                                line.id,
                                "salesPrice",
                                event.target.value,
                              )
                            }
                            className="w-32 rounded border border-slate-300 px-3 py-2"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={line.gstId}
                            onChange={(event) =>
                              updateLine(line.id, "gstId", event.target.value)
                            }
                            className="w-28 rounded border border-slate-300 px-2 py-2"
                          >
                            <option value="">GST</option>
                            {gsts.map((gst) => (
                              <option key={gst.id} value={gst.id}>
                                {String(
                                  gst.fields?.Gst ??
                                    gst.fields?.gst ??
                                    gst.label,
                                )}
                                %
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={line.hsnCode}
                            onChange={(event) =>
                              updateLine(line.id, "hsnCode", event.target.value)
                            }
                            className="w-32 rounded border border-slate-300 px-2 py-2"
                          >
                            <option value="">HSN</option>
                            {hsns.map((hsn) => (
                              <option key={hsn.id} value={hsn.label}>
                                {hsn.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          Rs{" "}
                          {(
                            numberValue(line.quantity) *
                            numberValue(line.purchasePrice)
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveStageOneRecord}>Save Record</Button>
              </div>
            </Card>
          </>
        )}

        {step === 2 && (
          <Card className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Stage 2
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Purchase Item Grouped in Subform (Purchase Items)
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Purchase items grouped in the subform. Open, delete, or create
                the grouped purchase bill.
              </p>
            </div>
            <ReportGrid<PurchaseRecordReportRow>
              title="Purchase Item Grouped in Subform (Purchase Items)"
              records={recordRows}
              fields={recordFields}
              visibleFields={visibleReviewFields}
              onVisibleFieldsChange={setVisibleReviewFields}
              rowIdSelector={(row) => row.id}
              selectedIds={selectedRecordIds}
              onToggleSelectAll={(checked) =>
                setSelectedRecordIds(
                  checked ? recordRows.map((row) => row.id) : [],
                )
              }
              onToggleRowSelection={(recordId, checked) =>
                setSelectedRecordIds((current) =>
                  checked
                    ? [...new Set([...current, recordId])]
                    : current.filter((id) => id !== recordId),
                )
              }
              onDeleteSelected={deleteSelectedRecords}
              deleteSelectedLabel="Delete Records"
              onRowClick={openSavedRecord}
              renderCell={(fieldKey, row) =>
                fieldKey === "record" ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openSavedRecord(row.id);
                    }}
                    className="font-semibold text-emerald-700 underline underline-offset-2"
                  >
                    Open Details
                  </button>
                ) : (
                  row[fieldKey as keyof PurchaseRecordReportRow]
                )
              }
              onNewOrder={resetForNextRecord}
              newActionLabel="New Record"
              emptyMessage="No purchase records saved."
            />{" "}
            <div className="flex justify-end">
              <Button
                onClick={continueToBillDetails}
                disabled={savedRecords.length === 0}
              >
                Create Purchase Bill
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Stage 3
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Purchase Bill in Subform (Purchase Grouped)
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm font-semibold text-slate-700">
                Vendor lookup
                <select
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Bill number
                <input
                  value={billNumber}
                  onChange={(event) => setBillNumber(event.target.value)}
                  placeholder="Auto-generated if blank"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Bill date
                <input
                  type="date"
                  value={billDate}
                  onChange={(event) => setBillDate(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Tax mode
                <select
                  value={taxMode}
                  onChange={(event) =>
                    setTaxMode(event.target.value as "LOCAL" | "INTERSTATE")
                  }
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                >
                  <option value="LOCAL">CGST + SGST</option>
                  <option value="INTERSTATE">IGST</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Purchase Group / Material</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Purchase price</th>
                    <th className="px-4 py-3">Sales price</th>
                    <th className="px-4 py-3">GST</th>
                    <th className="px-4 py-3">HSN</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 font-semibold">
                        {line.itemName || "Purchase group"}
                      </td>
                      <td className="px-4 py-3">{line.quantity}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.purchasePrice}
                          readOnly
                          className="w-28 rounded border border-slate-300 px-3 py-2"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.salesPrice}
                          readOnly
                          className="w-28 rounded border border-slate-300 px-3 py-2"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={line.gstId}
                          disabled
                          className="w-24 rounded border border-slate-300 px-2 py-2"
                        >
                          <option value="">GST</option>
                          {gsts.map((gst) => (
                            <option key={gst.id} value={gst.id}>
                              {String(
                                gst.fields?.Gst ?? gst.fields?.gst ?? gst.label,
                              )}
                              %
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={line.hsnCode}
                          disabled
                          className="w-28 rounded border border-slate-300 px-2 py-2"
                        >
                          <option value="">HSN</option>
                          {hsns.map((hsn) => (
                            <option key={hsn.id} value={hsn.label}>
                              {hsn.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <strong>Rs {totals.subtotal.toFixed(2)}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>{taxMode === "INTERSTATE" ? "IGST" : "CGST + SGST"}</span>
                <strong>
                  Rs {(totals.cgst + totals.sgst + totals.igst).toFixed(2)}
                </strong>
              </div>
              <div className="mt-3 flex justify-between border-t border-slate-300 pt-3 text-base font-bold">
                <span>Total amount</span>
                <span>
                  Rs{" "}
                  {(
                    totals.subtotal +
                    totals.cgst +
                    totals.sgst +
                    totals.igst
                  ).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={saveBill} disabled={posting}>
                {posting ? "Posting..." : "Post Purchase Bill"}
              </Button>
            </div>
          </Card>
        )}
      </Section>
      <Modal
        open={Boolean(recordSuccessNumber)}
        onClose={() => setRecordSuccessNumber("")}
        ariaLabel="Purchase record saved"
        variant="success"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Saved successfully
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Purchase record saved
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {recordSuccessNumber || "The purchase record"} is now available in
              the grouped records stage.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setRecordSuccessNumber("")}
            >
              Continue entry
            </Button>
            <Button
              onClick={() => {
                setRecordSuccessNumber("");
                setStep(2);
              }}
            >
              View grouped records
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
