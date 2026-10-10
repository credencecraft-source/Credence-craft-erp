"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { Boxes, FileDown, Plus } from "lucide-react";
import type { jsPDF as JsPdf } from "jspdf";
import { calculateBomRows, calculateFinishedGoodsRows, splitBomSizes } from "@/lib/services/orders/order-quantity-calculations";
import { findDuplicateBomMaterialNames, getBomMaterialIdentity } from "@/lib/services/orders/bom-row-validation";
import type { OrderFormState, BomEditorRow } from "./order-form-types";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

type BomRow = BomEditorRow;
type MasterDataOption = {
  id?: string;
  label?: string;
  value_id?: string;
  name?: string;
  parent_id?: string | null;
  parentValueId?: string | null;
  parent_label?: string;
  parentName?: string;
  parent?: string;
  category?: string;
  categoryName?: string;
  sub_category_id?: string;
  subCategoryId?: string;
  subCategory?: string;
  sub_category?: string;
  is_active?: boolean;
  fields?: Record<string, unknown>;
};

const defaultBomRow = (categoryOverride?: string): BomRow => ({
  categoryType: "",
  category: categoryOverride ?? "",
  subCategory: "",
  rawMaterialName: "",
  image: "",
  stockUom: "",
  size: "",
  consumption: "",
  requiredQty: "",
  itemWiseExcessPercentage: "",
  itemWiseExcessQty: "",
  totalRequiredQty: "",
});

const DEFAULT_BOM_ROWS = [defaultBomRow()];

const BOMB_CATEGORY_TEXT_MAP: Record<string, string> = {
  fabric: "Fabric",
  "main-trims": "Main Trims",
  "main trims": "Main Trims",
  "maintrims": "Main Trims",
  "sewing-trims": "Sewing Trims",
  "sewing trims": "Sewing Trims",
  "packing-trims": "Packing Trims",
  "packing trims": "Packing Trims",
  "packaging-trims": "Packing Trims",
  "packaging trims": "Packing Trims",
  "packing": "Packing Trims",
};

const normalizeBomCategory = (value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Uncategorized";

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return "Uncategorized";

  return BOMB_CATEGORY_TEXT_MAP[normalized] ?? trimmed;
};

export default function BomTab({
  form,
  setForm,
  renderMasterSelect,
  onOpenCreateMaster,
  masterOptions,
}: {
  form: OrderFormState;
  setForm: React.Dispatch<React.SetStateAction<OrderFormState>>;
  renderMasterSelect?: (
    value: string,
    onChange: (value: string) => void,
    masterKey: string,
    placeholder: string,
    parentCategoryValue?: string
  ) => React.ReactNode;
  onOpenCreateMaster?: (masterKey: string) => void;
  masterOptions?: Record<string, MasterDataOption[]>;
}) {
  const bomRows = form.bomRows?.length ? form.bomRows : DEFAULT_BOM_ROWS;
  const duplicateMaterials = useMemo(() => findDuplicateBomMaterialNames(form.bomRows ?? []), [form.bomRows]);
  const finishedGoods = useMemo(() => calculateFinishedGoodsRows(form.rows), [form.rows]);
  const calculatedBomRows = useMemo(
    () => calculateBomRows(bomRows, finishedGoods.rows, finishedGoods.orderQty),
    [bomRows, finishedGoods],
  );
  const [selectedBomCategory, setSelectedBomCategory] = useState<string>("All");
  const [selectedBomSubCategory, setSelectedBomSubCategory] = useState<string>("All");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [sizePickerRowIndex, setSizePickerRowIndex] = useState<number | null>(null);
  const [sizeSearch, setSizeSearch] = useState("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const isAllCategoryView = selectedBomCategory === "All";

  const categorySet = new Set<string>(["All"]);
  for (const option of masterOptions?.["raw-material-category"] ?? []) {
    const label = String(option.label ?? option.name ?? "").trim();
    if (label) categorySet.add(normalizeBomCategory(label));
  }
  for (const row of calculatedBomRows) {
    const normalized = normalizeBomCategory(String(row.category ?? ""));
    if (normalized && normalized !== "Uncategorized") categorySet.add(normalized);
  }
  const bomCategories = Array.from(categorySet);

  const visibleBomRows = calculatedBomRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const matchesCategory = selectedBomCategory === "All" || normalizeBomCategory(String(row.category ?? "")) === selectedBomCategory;
      const matchesSubCategory = selectedBomSubCategory === "All" || String(row.subCategory ?? "").trim() === selectedBomSubCategory;
      return matchesCategory && matchesSubCategory;
    });

  const addBomRow = () => {
    const nextCategory = selectedBomCategory !== "All" ? selectedBomCategory : "";
    const nextRow = defaultBomRow(nextCategory);
    nextRow.subCategory = selectedBomSubCategory !== "All" ? selectedBomSubCategory : "";
    setForm((current) => ({
      ...current,
      bomRows: [...(current.bomRows || []), nextRow],
    }));
  };

  const removeBomRow = (index: number) => {
    setForm((current) => ({
      ...current,
      bomRows: (current.bomRows || []).filter((_, i) => i !== index),
    }));
  };

  const updateBomRow = (index: number, field: keyof BomRow, value: string) => {
    setForm((current) => {
      const updatedRows = [...(current.bomRows || [])];
      const currentRow = updatedRows[index] ?? {};
      updatedRows[index] = { ...currentRow, [field]: value };

      if (field === "category") {
        const nextCategory = String(value ?? "").trim();
        const validSubCategories = getFilteredSubCategoryOptions(nextCategory);
        const currentSubCategory = String(currentRow.subCategory ?? "").trim();

        const hasValidSubCategory = validSubCategories.some((option) => {
          const label = String(option.label ?? option.name ?? "").trim();
          return label === currentSubCategory;
        });

        updatedRows[index].subCategory = nextCategory && currentSubCategory && !hasValidSubCategory ? "" : currentSubCategory;
      }

      return { ...current, bomRows: updatedRows };
    });
  };

  const getFilteredSubCategoryOptions = (categoryValue: string) => {
    if (!masterOptions) return [];

    const normalizeOptionText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const categoryOptions = masterOptions["raw-material-category"] ?? [];
    const targetCategoryText = normalizeOptionText(categoryValue);

    if (!targetCategoryText) {
      return [];
    }

    const selectedCategory = categoryOptions.find((option) => {
      const optionText = normalizeOptionText(option.label ?? option.name ?? "");
      const normalizedCategory = normalizeBomCategory(String(option.label ?? option.name ?? ""));
      return optionText === targetCategoryText || normalizedCategory === normalizeBomCategory(categoryValue);
    });

    if (!selectedCategory) {
      return [];
    }

    const selectedCategoryIds = new Set(
      [selectedCategory?.id, selectedCategory?.value_id, selectedCategory?.parent_id, selectedCategory?.parentValueId]
        .filter(Boolean)
        .map((value) => String(value)),
    );
    const selectedCategoryLabels = new Set(
      [selectedCategory?.label, selectedCategory?.name, categoryValue]
        .filter(Boolean)
        .map((value) => normalizeOptionText(value)),
    );

    const subCategoryOptions = masterOptions["raw-material-sub-category"] ?? [];

    return subCategoryOptions.filter((option) => {
      const optionFields = option.fields ?? {};
      const optionParentIds = [
        option.parent_id,
        option.parentValueId,
        optionFields.raw_material_category_id,
        optionFields.Raw_Material_Category1,
      ].filter(Boolean).map((value) => String(value));
      const parentLabel = String(
        option.parent_label
          ?? option.parentName
          ?? option.parent
          ?? optionFields.raw_material_category
          ?? optionFields.Raw_Material_Category1
          ?? "",
      ).trim();
      const categoryLabel = String(option.category ?? option.categoryName ?? "").trim();

      return optionParentIds.some((parentId) => selectedCategoryIds.has(parentId))
        || selectedCategoryLabels.has(normalizeOptionText(parentLabel))
        || selectedCategoryLabels.has(normalizeOptionText(categoryLabel))
        || normalizeBomCategory(parentLabel) === normalizeBomCategory(categoryValue)
        || normalizeBomCategory(categoryLabel) === normalizeBomCategory(categoryValue);
    });
  };

  const getFilteredRawMaterialOptions = (categoryValue: string, subCategoryValue: string) => {
    if (!masterOptions || !subCategoryValue) return [];

    const normalizeOptionText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const rawMaterialOptions = masterOptions["raw-material"] ?? [];
    const subCategoryOptions = masterOptions["raw-material-sub-category"] ?? [];

    const selectedSubCategory = subCategoryOptions.find((option) => {
      const optionLabel = String(option.label ?? option.name ?? "").trim();
      return normalizeOptionText(optionLabel) === normalizeOptionText(subCategoryValue);
    });

    if (!selectedSubCategory) {
      return [];
    }

    const selectedSubCategoryIds = new Set(
      [
        selectedSubCategory?.id,
        selectedSubCategory?.value_id,
        selectedSubCategory?.parent_id,
        selectedSubCategory?.parentValueId,
        selectedSubCategory?.fields?.Raw_Material_Category1,
      ]
        .filter(Boolean)
        .map((value) => String(value)),
    );
    const selectedSubCategoryLabels = new Set(
      [selectedSubCategory?.label, selectedSubCategory?.name, subCategoryValue]
        .filter(Boolean)
        .map((value) => normalizeOptionText(value)),
    );

    return rawMaterialOptions.filter((option) => {
      const optionFields = option.fields ?? {};
      const optionParentIds = [
        option.parent_id,
        option.parentValueId,
        option.sub_category_id,
        option.subCategoryId,
        optionFields.Subcategory,
        optionFields.raw_material_sub_category_id,
      ].filter(Boolean).map((value) => String(value));
      const optionCategory = String(option.category ?? option.categoryName ?? optionFields.Category ?? "").trim();
      const optionSubCategory = String(
        option.subCategory
          ?? option.sub_category
          ?? optionFields.Subcategory
          ?? optionFields.raw_material_sub_category
          ?? "",
      ).trim();

      return optionParentIds.some((parentId) => selectedSubCategoryIds.has(parentId))
        || selectedSubCategoryLabels.has(normalizeOptionText(optionSubCategory))
        || normalizeOptionText(optionCategory) === normalizeOptionText(categoryValue);
    });
  };

  const getRawMaterialStockUom = (rawMaterialName: string) => {
    const option = (masterOptions?.["raw-material"] ?? []).find((item) =>
      String(item.label ?? item.name ?? "").trim() === rawMaterialName.trim(),
    );
    return String(option?.fields?.Stock_Uom1 ?? option?.fields?.stock_uom_id ?? "").trim();
  };

  const getRawMaterialImage = (rawMaterialName: string) => {
    const option = (masterOptions?.["raw-material"] ?? []).find((item) =>
      String(item.label ?? item.name ?? "").trim() === rawMaterialName.trim(),
    );
    return String(option?.fields?.Image_Url ?? option?.fields?.image_url ?? "").trim();
  };

  const selectBomSubCategory = (subcategory: string) => {
    setSelectedBomSubCategory(subcategory);
    if (subcategory === "All") return;

    const rawMaterials = getFilteredRawMaterialOptions(selectedBomCategory, subcategory);
    setForm((current) => {
      const rows = [...(current.bomRows || [])];
      const existingIndex = rows.findIndex((row) => String(row.subCategory ?? "").trim() === subcategory);
      if (existingIndex >= 0) return current;

      const availableRawMaterials = rawMaterials.filter((option) => {
        const candidate = {
          category: selectedBomCategory,
          subCategory: subcategory,
          rawMaterialName: String(option.label ?? option.name ?? "").trim(),
        };
        const identity = getBomMaterialIdentity(candidate);
        return !rows.some((row: BomRow) => getBomMaterialIdentity(row) === identity);
      });
      const rawMaterial = availableRawMaterials.length === 1 ? availableRawMaterials[0] : null;
      const rawMaterialName = rawMaterial ? String(rawMaterial.label ?? rawMaterial.name ?? "").trim() : "";
      const nextRow: BomRow = {
        ...defaultBomRow(selectedBomCategory),
        subCategory: subcategory,
        rawMaterialName,
        stockUom: getRawMaterialStockUom(rawMaterialName),
        image: getRawMaterialImage(rawMaterialName),
      };
      const blankIndex = rows.findIndex((row: BomRow) => !row.subCategory && !row.rawMaterialName);
      if (blankIndex >= 0) rows[blankIndex] = nextRow;
      else rows.push(nextRow);

      return { ...current, bomRows: rows };
    });
  };

  const renderSizePicker = (row: BomRow, index: number) => {
    const selectedSizes = splitBomSizes(row.size);
    const availableSizes = (masterOptions?.size ?? [])
      .map((option) => String(option.label ?? option.name ?? "").trim())
      .filter((size) => size && !selectedSizes.includes(size));
    const filteredSizes = availableSizes.filter((size) => size.toLowerCase().includes(sizeSearch.trim().toLowerCase()));
    const addSize = (size: string) => {
      if (!size || selectedSizes.includes(size)) return;
      updateBomRow(index, "size", [...selectedSizes, size].join(", "));
    };
    const removeSize = (size: string) => updateBomRow(index, "size", selectedSizes.filter((item) => item !== size).join(", "));

    return (
      <>
        <Button
          type="button"
          variant="secondary"
          onClick={() => { setSizePickerRowIndex(index); setSizeSearch(""); }}
          aria-label={selectedSizes.length > 0 ? `Edit sizes: ${selectedSizes.join(", ")}` : "Select sizes"}
          className="flex min-h-10 w-full flex-wrap items-center justify-start gap-1 rounded-xl p-1.5 text-left"
        >
          {selectedSizes.length === 0 ? (
            <span className="px-1 text-[12px] font-normal text-slate-400">Select sizes</span>
          ) : selectedSizes.map((size) => (
            <span key={size} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold leading-4 text-emerald-800">
              {size}
            </span>
          ))}
        </Button>
        <Modal
          open={sizePickerRowIndex === index}
          onClose={() => setSizePickerRowIndex(null)}
          ariaLabel="Select BOM sizes"
          size="sm"
          className="p-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Select sizes</h3>
                <p className="text-[10px] text-slate-500">Search and select sizes for this raw material.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSizePickerRowIndex(null)} aria-label="Close size selector">X</Button>
            </div>
            <Input value={sizeSearch} onChange={(event) => setSizeSearch(event.target.value)} placeholder="Type to search sizes..." autoFocus className="h-8 px-2 text-xs" />
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-1">
              {filteredSizes.length === 0 ? (
                <p className="p-2 text-[10px] text-slate-500">No matching sizes.</p>
              ) : filteredSizes.map((size) => (
                <Button key={size} type="button" variant="ghost" onClick={() => addSize(size)} className="w-full justify-start px-2 py-1.5 text-xs">{size}</Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1.5">
              {selectedSizes.length === 0 ? <span className="text-[10px] text-slate-400">No sizes selected</span> : selectedSizes.map((size) => (
                <span key={size} className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-1.5 pr-0.5 text-[10px] font-semibold text-emerald-800">
                  {size}
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSize(size)} aria-label={`Remove ${size}`} className="h-4 min-h-0 rounded-full px-0.5 text-[10px] leading-3">x</Button>
                </span>
              ))}
            </div>
          </div>
        </Modal>
      </>
    );
  };

  const downloadBomPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfError("");
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const document = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = document.internal.pageSize.getWidth();
    const margin = 14;
    const value = (input: unknown) => String(input ?? "").trim() || "-";
    const filePart = value(form?.orderNo).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "order";

    document.setProperties({ title: `BOM - ${value(form?.orderNo)}`, subject: "Bill of Materials" });
    document.setFillColor(51, 65, 85);
    document.rect(0, 0, pageWidth, 8, "F");
    document.setTextColor(15, 23, 42);
    document.setFont("helvetica", "bold");
    document.setFontSize(22);
    document.text("Bill of Materials", margin, 20);
    document.setFont("helvetica", "normal");
    document.setFontSize(9);
    document.setTextColor(100, 116, 139);
    document.text("Finished goods and material requirement summary", margin, 26);
    document.setTextColor(15, 23, 42);
    document.setFont("helvetica", "bold");
    document.text(`Order No: ${value(form?.orderNo)}`, pageWidth - margin, 16, { align: "right" });
    document.setFont("helvetica", "normal");
    document.text(`Status: ${value(form?.finalStatus || "Draft")}`, pageWidth - margin, 22, { align: "right" });

    const orderDetails = [
      ["Article", form?.article], ["Style", form?.styleName], ["Buyer", form?.buyer], ["Brand", form?.brand],
      ["Season", form?.season], ["Size Group", form?.sizeGroup], ["Order Qty", form?.orderQty], ["Delivery Date", form?.deliveryDate],
    ];
    document.setFillColor(241, 245, 249);
    document.roundedRect(margin, 34, pageWidth - margin * 2, 9, 1.5, 1.5, "F");
    document.setTextColor(51, 65, 85);
    document.setFont("helvetica", "bold");
    document.setFontSize(11);
    document.text("01  Order Details", margin + 4, 40);
    autoTable(document, {
      startY: 47,
      margin: { left: margin, right: margin },
      body: [orderDetails.slice(0, 4).map(([label, item]) => `${label} - ${value(item)}`), orderDetails.slice(4).map(([label, item]) => `${label} - ${value(item)}`)],
      theme: "plain",
      tableWidth: pageWidth - margin * 2,
      styles: { font: "helvetica", fontSize: 8.5, textColor: [15, 23, 42], cellPadding: { top: 2, right: 3, bottom: 2, left: 0 } },
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 47 } },
      didParseCell: (data) => { data.cell.styles.fontStyle = "normal"; },
    });

    let nextY = (document as JsPdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 64;
    const sectionTitle = (title: string) => {
      document.setFillColor(241, 245, 249);
      document.roundedRect(margin, nextY + 5, pageWidth - margin * 2, 9, 1.5, 1.5, "F");
      document.setTextColor(51, 65, 85);
      document.setFont("helvetica", "bold");
      document.setFontSize(11);
      document.text(title, margin + 4, nextY + 11);
      nextY += 18;
    };

    sectionTitle("02  Finished Goods");
    autoTable(document, {
      startY: nextY,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      head: [["Size", "Before Qty", "Excess %", "Excess Qty", "Total Qty"]],
      body: finishedGoods.rows.map((row) => [value(row.size), value(row.beforeExcessQty), value(row.excess), value(row.excessQty), value(row.totalQty)]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold", fontSize: 8, cellPadding: 2.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 32 }, 2: { cellWidth: 30 }, 3: { cellWidth: 32 }, 4: { cellWidth: 34 } },
    });
    nextY = (document as JsPdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 20;

    sectionTitle("03  Bill of Materials");
    autoTable(document, {
      startY: nextY,
      margin: { left: margin, right: margin },
      tableWidth: pageWidth - margin * 2,
      head: [["Category", "Sub Category", "Raw Material", "UOM", "Size(s)", "Int. Cons.", "Req. Qty", "Excess %", "Total Req."]],
      body: calculatedBomRows.map((row) => [value(row.category), value(row.subCategory), value(row.rawMaterialName), value(row.stockUom), value(row.size || "All"), value(row.internalConsumption || row.consumption), value(row.requiredQty), value(row.itemWiseExcessPercentage), value(row.totalRequiredQty)]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold", fontSize: 7.5, cellPadding: 2.2 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.2, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.2, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 24 }, 2: { cellWidth: 32 }, 3: { cellWidth: 14 }, 4: { cellWidth: 20 }, 5: { cellWidth: 18 }, 6: { cellWidth: 18 }, 7: { cellWidth: 15 }, 8: { cellWidth: 21 } },
    });

    const pageCount = document.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      document.setPage(pageNumber);
      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      document.setTextColor(100, 116, 139);
      document.text(`Generated from merchandising order | Page ${pageNumber} of ${pageCount}`, margin, document.internal.pageSize.getHeight() - 8);
      document.text(value(form?.orderNo), pageWidth - margin, document.internal.pageSize.getHeight() - 8, { align: "right" });
    }

      document.save(`BOM-${filePart}.pdf`);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Unable to create the BOM PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <>
    <Section className="space-y-4 print:hidden">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-slate-50 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <Boxes className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Order planning</p>
              <h2 className="text-base font-bold tracking-tight text-slate-950">Bill of Materials</h2>
              <p className="mt-0.5 text-xs text-slate-500">Review material requirements by category and size.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">
              {calculatedBomRows.length} material lines
            </Badge>
            <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">
              Order qty {String(finishedGoods.orderQty ?? 0)}
            </Badge>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Category</span>
              {bomCategories.map((category) => {
                const categoryCount = category === "All"
                  ? calculatedBomRows.length
                  : calculatedBomRows.filter((row) => normalizeBomCategory(String(row.category ?? "")) === category).length;
                const selected = selectedBomCategory === category;
                return (
                  <Button
                    variant={selected ? "primary" : "secondary"}
                    size="sm"
                    key={category}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedBomCategory(category);
                      setSelectedBomSubCategory("All");
                    }}
                    className="min-h-8 gap-2 rounded-full px-3.5 text-xs"
                  >
                    {category}
                    <span className={selected ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]" : "rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"}>
                      {categoryCount}
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Checkbox
                label="Advanced fields"
                checked={showAdvancedFields}
                onChange={(event) => setShowAdvancedFields(event.target.checked)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={downloadBomPdf}
                disabled={isDownloadingPdf}
                className="gap-1.5"
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                {isDownloadingPdf ? "Preparing PDF..." : "Download PDF"}
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={addBomRow}
                disabled={isAllCategoryView}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add row
              </Button>
            </div>
            {pdfError && (
              <p role="alert" className="text-sm text-[var(--erp-danger)]">
                {pdfError}
              </p>
            )}
          </div>

          {selectedBomCategory !== "All" && getFilteredSubCategoryOptions(selectedBomCategory).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Subcategory</span>
              {["All", ...getFilteredSubCategoryOptions(selectedBomCategory).map((option) => String(option.label ?? option.name ?? "").trim()).filter(Boolean)]
                .filter((subcategory, index, values) => values.indexOf(subcategory) === index)
                .map((subcategory) => {
                  const selected = selectedBomSubCategory === subcategory;
                  return (
                    <Button
                      key={subcategory}
                      variant={selected ? "primary" : "secondary"}
                      size="sm"
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectBomSubCategory(subcategory)}
                      className="min-h-7 rounded-full px-3 text-[10px]"
                    >
                      {subcategory === "All" ? "All subcategories" : subcategory}
                    </Button>
                  );
                })}
            </div>
          ) : null}

          {duplicateMaterials.length > 0 && (
            <Card role="alert" className="border-amber-200 bg-amber-50/70 p-3 shadow-none">
              <p className="text-xs text-amber-950">
                <Badge className="mr-2 bg-amber-100 text-amber-900">Review duplicates</Badge>
                Duplicate BOM material{duplicateMaterials.length === 1 ? "" : "s"}: {duplicateMaterials.join(", ")}. Keep one row per material in the order; add all applicable sizes to that row before saving.
              </p>
            </Card>
          )}
        </div>
      </Card>

      <fieldset disabled={isAllCategoryView} className="min-w-0 border-0 p-0">
        <Table className="overscroll-x-contain print:hidden" tableClassName="min-w-[1650px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[320px]" />
            <col className="w-[560px]" />
            <col className="w-[140px]" />
            <col className="w-[210px]" />
            {showAdvancedFields && <col className="w-[190px]" />}
            {showAdvancedFields && <col className="w-[190px]" />}
            <col className="w-[190px]" />
            <col className="w-[190px]" />
            <col className="w-[190px]" />
            {showAdvancedFields && <col className="w-[190px]" />}
            {showAdvancedFields && <col className="w-[190px]" />}
            <col className="w-[190px]" />
            {showAdvancedFields && <col className="w-[120px]" />}
          </colgroup>
          <thead className="border-b border-slate-200 bg-white text-slate-600">
            <tr>
              <th className="h-12 whitespace-normal p-2 text-center align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Image</th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">
                <div className="flex min-h-10 items-center gap-1">
                  <span className="leading-4">Sub Category</span>
                  {onOpenCreateMaster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material-sub-category")}
                      className="ml-auto shrink-0 px-1 text-[10px] font-medium normal-case leading-3 text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">
                <div className="flex min-h-10 items-center gap-1">
                  <span className="leading-4">Raw Material</span>
                  {onOpenCreateMaster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("raw-material")}
                      className="ml-auto shrink-0 px-1 text-[10px] font-medium normal-case leading-3 text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">UOM</th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">
                <div className="flex min-h-10 items-center gap-1">
                  <span className="leading-4">Size</span>
                  {onOpenCreateMaster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenCreateMaster("size")}
                      className="ml-auto shrink-0 px-1 text-[10px] font-medium normal-case leading-3 text-emerald-600 hover:text-emerald-700"
                    >
                      + New
                    </Button>
                  )}
                </div>
              </th>
              {showAdvancedFields && <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Buyer Cons.</th>}
              {showAdvancedFields && <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Buyer Rate</th>}
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Int. Cons.</th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Int. Rate</th>
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Req. Qty</th>
              {showAdvancedFields && <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Excess %</th>}
              {showAdvancedFields && <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Excess Qty</th>}
              <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Total Req.</th>
              {showAdvancedFields && <th className="h-12 whitespace-normal p-2 align-middle text-[11px] font-bold uppercase leading-4 tracking-wide">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleBomRows.map(({ row, index }: { row: BomRow; index: number }) => (
              <tr key={`${index}-${row.rawMaterialName || "row"}`} className="bg-white">
                <td className="p-2.5 align-top">
                  <div
                    className="relative flex h-18 w-18 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-center text-[10px] font-semibold uppercase leading-3 text-slate-400 shadow-sm"
                    title="Image from Raw Material master"
                  >
                    {row.image || getRawMaterialImage(String(row.rawMaterialName ?? "")) ? (
                      <Image src={row.image || getRawMaterialImage(String(row.rawMaterialName ?? ""))} alt="" fill sizes="72px" className="object-cover" />
                    ) : (
                      "No image"
                    )}
                  </div>
                </td>
                <td className="p-2.5 align-top">
                  {renderMasterSelect ? (() => {
                    const filteredSubCategories = getFilteredSubCategoryOptions(String(row.category ?? ""));
                    const safeOptions = filteredSubCategories.filter((option) => option.label || option.name);
                    const value = String(row.subCategory ?? "");

                    return (
                      <Select
                        aria-label="Sub category"
                        value={value}
                        onChange={(event) => updateBomRow(index, "subCategory", event.target.value)}
                        options={[{ value: "", label: "Select sub category" }, ...safeOptions.map((option) => ({ value: option.label ?? option.name ?? "", label: option.label ?? option.name ?? "" }))]}
                        className="min-h-10 text-xs"
                      />
                    );
                  })() : (
                    <Input
                      value={row.subCategory || ""}
                      onChange={(e) => updateBomRow(index, "subCategory", e.target.value)}
                      placeholder="Sub Category"
                      className="min-h-10 text-xs"
                    />
                  )}
                </td>
                <td className="p-2.5 align-top">
                  {renderMasterSelect ? (() => {
                    const filteredRawMaterials = getFilteredRawMaterialOptions(String(row.category ?? ""), String(row.subCategory ?? ""));
                    const value = String(row.rawMaterialName ?? "");
                    const safeOptions = filteredRawMaterials.filter((option) => {
                      const rawMaterialName = String(option.label ?? option.name ?? "").trim();
                      if (rawMaterialName.toLocaleLowerCase() === value.trim().toLocaleLowerCase()) return true;
                      const identity = getBomMaterialIdentity({ ...row, rawMaterialName });
                      return !(form?.bomRows ?? []).some((candidate: BomRow, candidateIndex: number) =>
                        candidateIndex !== index && getBomMaterialIdentity(candidate) === identity,
                      );
                    });

                    return (
                      <Select
                        aria-label="Raw material"
                        value={value}
                        onChange={(event) => {
                          const rawMaterialName = event.target.value;
                          updateBomRow(index, "rawMaterialName", rawMaterialName);
                          updateBomRow(index, "stockUom", getRawMaterialStockUom(rawMaterialName));
                          updateBomRow(index, "image", getRawMaterialImage(rawMaterialName));
                        }}
                        options={[{ value: "", label: row.subCategory ? "Select raw material" : "Select sub category first" }, ...safeOptions.map((option) => ({ value: option.label ?? option.name ?? "", label: option.label ?? option.name ?? "" }))]}
                        className="min-h-10 text-xs"
                      />
                    );
                  })() : (
                    <Input
                      value={row.rawMaterialName || ""}
                      onChange={(e) => updateBomRow(index, "rawMaterialName", e.target.value)}
                      placeholder="Name"
                      className="min-h-10 text-xs"
                    />
                  )}
                </td>
                <td className="p-2.5 align-top">
                  <Input
                    value={String(row.stockUom ?? getRawMaterialStockUom(String(row.rawMaterialName ?? "")))}
                    disabled
                    placeholder="Auto-filled"
                    className="min-h-10 text-xs"
                  />
                </td>
                <td className="min-w-[190px] whitespace-nowrap p-2.5 align-top">
                  {renderSizePicker(row, index)}
                </td>
                {showAdvancedFields && <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.buyerConsumption || ""}
                    onChange={(e) => updateBomRow(index, "buyerConsumption", e.target.value)}
                    placeholder="0"
                    className="min-h-9 text-xs"
                  />
                </td>}
                {showAdvancedFields && <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.buyerPrice || ""}
                    onChange={(e) => updateBomRow(index, "buyerPrice", e.target.value)}
                    placeholder="0.00"
                    className="min-h-9 text-xs"
                  />
                </td>}
                <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.internalConsumption || ""}
                    onChange={(e) => updateBomRow(index, "internalConsumption", e.target.value)}
                    placeholder="0"
                    className="min-h-9 text-xs"
                  />
                </td>
                <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.internalPrice || ""}
                    onChange={(e) => updateBomRow(index, "internalPrice", e.target.value)}
                    placeholder="0.00"
                    className="min-h-9 text-xs"
                  />
                </td>
                <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.requiredQty || ""}
                    readOnly
                    placeholder="0"
                    className="min-h-9 text-xs"
                  />
                </td>
                {showAdvancedFields && <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.itemWiseExcessPercentage || ""}
                    onChange={(e) => updateBomRow(index, "itemWiseExcessPercentage", e.target.value)}
                    placeholder="0"
                    className="min-h-9 text-xs"
                  />
                </td>}
                {showAdvancedFields && <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.itemWiseExcessQty || ""}
                    readOnly
                    placeholder="0"
                    className="min-h-9 text-xs"
                  />
                </td>}
                <td className="p-2.5 align-top">
                  <Input
                    type="number"
                    value={row.totalRequiredQty || ""}
                    readOnly
                    placeholder="0"
                    className="min-h-9 w-full text-xs"
                  />
                </td>
                {showAdvancedFields && <td className="p-2 align-top">
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    onClick={() => removeBomRow(index)}
                    className="rounded-md px-2 py-1"
                  >
                    Delete
                  </Button>
                </td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </fieldset>
    </Section>
    <div className="hidden print:block print:bg-white print:p-0">
      <header className="border-b-2 border-emerald-700 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Order Management</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Bill of Materials</h1>
            <p className="mt-1 text-xs text-slate-500">Finished goods and material requirement summary</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p><span className="font-semibold text-slate-900">Order No:</span> {form?.orderNo || "-"}</p>
            <p className="mt-1"><span className="font-semibold text-slate-900">Status:</span> {form?.finalStatus || "Draft"}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-x-6 gap-y-3 text-xs">
          {[
            ["Article", form?.article],
            ["Style", form?.styleName],
            ["Buyer", form?.buyer],
            ["Brand", form?.brand],
            ["Season", form?.season],
            ["Size Group", form?.sizeGroup],
            ["Order Qty", form?.orderQty],
            ["Delivery Date", form?.deliveryDate],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-0.5 font-semibold text-slate-900">{String(value || "-")}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Finished Goods</h2>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="border-y border-slate-300 text-left font-bold uppercase text-slate-600">
            <th className="px-2 py-2">Buyer Size</th><th className="px-2 py-2">Size</th><th className="px-2 py-2 text-right">Before Qty</th><th className="px-2 py-2 text-right">Excess %</th><th className="px-2 py-2 text-right">Excess Qty</th><th className="px-2 py-2 text-right">Total Qty</th>
          </tr></thead>
          <tbody>{finishedGoods.rows.map((row, index) => <tr key={`${row.size || "size"}-${index}`} className="border-b border-slate-200">
            <td className="px-2 py-2">{row.buyerSize || "-"}</td><td className="px-2 py-2">{row.size || "-"}</td><td className="px-2 py-2 text-right">{row.beforeExcessQty || 0}</td><td className="px-2 py-2 text-right">{row.excess || 0}</td><td className="px-2 py-2 text-right">{row.excessQty || 0}</td><td className="px-2 py-2 text-right font-semibold">{row.totalQty || 0}</td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Bill of Materials</h2>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="border-y border-slate-300 text-left font-bold uppercase text-slate-600">
            <th className="px-2 py-2">Category</th><th className="px-2 py-2">Sub Category</th><th className="px-2 py-2">Raw Material</th><th className="px-2 py-2">Stock UOM</th><th className="px-2 py-2">Size(s)</th><th className="px-2 py-2 text-right">Consumption</th><th className="px-2 py-2 text-right">Required Qty</th><th className="px-2 py-2 text-right">Excess %</th><th className="px-2 py-2 text-right">Total Required</th>
          </tr></thead>
          <tbody>{calculatedBomRows.map((row, index) => <tr key={`${row.id || "bom"}-${index}`} className="border-b border-slate-200">
            <td className="px-2 py-2">{row.category || "-"}</td><td className="px-2 py-2">{row.subCategory || "-"}</td><td className="px-2 py-2 font-semibold">{row.rawMaterialName || "-"}</td><td className="px-2 py-2">{row.stockUom || "-"}</td><td className="px-2 py-2">{row.size || "All"}</td><td className="px-2 py-2 text-right">{row.internalConsumption || row.consumption || 0}</td><td className="px-2 py-2 text-right">{row.requiredQty || 0}</td><td className="px-2 py-2 text-right">{row.itemWiseExcessPercentage || 0}</td><td className="px-2 py-2 text-right font-semibold">{row.totalRequiredQty || 0}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <footer className="mt-8 border-t border-slate-200 pt-2 text-[9px] text-slate-500">Generated from the merchandising order BOM.</footer>
    </div>
    </>
  );
}