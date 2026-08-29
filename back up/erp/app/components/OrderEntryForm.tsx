"use client";

import { useMemo, useState } from "react";

type SizeRow = {
  id: number;
  size: string;
  beforeExcessQty: number;
  excess: number;
  excessQty: number;
  totalQty: number;
  buyerPoPrice: number;
  value: number;
};

type OrderFormState = {
  entityName: string;
  category: string;
  subCategory: string;
  season: string;
  article: string;
  styleName: string;
  colors: string;
  buyer: string;
  brand: string;
  sizeGroup: string;
  typeField: "Direct" | "Bulk";
  fob: number;
  orderQty: number;
  orderQtyWithoutExcess: number;
  orderValue: number;
  deliveryDate: string;
  buyerPoDate: string;
  buyerPoNo: string;
  merchandiser: string;
  orderVolume: string;
  gst: string;
  hsnCode: string;
  sourceImportId: string;
  remarks: string;
};

type OrderEntryFormProps = {
  defaultStatus?: string;
  onSaved?: () => void;
  onCancel?: () => void;
  organizationId?: string | null;
};

type OrderTab = "details" | "qty" | "summary";

const initialFormState: OrderFormState = {
  entityName: "",
  category: "",
  subCategory: "",
  season: "",
  article: "",
  styleName: "",
  colors: "",
  buyer: "",
  brand: "",
  sizeGroup: "",
  typeField: "Direct",
  fob: 0,
  orderQty: 0,
  orderQtyWithoutExcess: 0,
  orderValue: 0,
  deliveryDate: "",
  buyerPoDate: "",
  buyerPoNo: "",
  merchandiser: "",
  orderVolume: "Medium",
  gst: "",
  hsnCode: "",
  sourceImportId: "",
  remarks: "",
};

const sizeOptions = ["XS", "S", "M", "L", "XL", "XXL"];

function createRowsFromSizes(source: string[], excessDefault = 0): SizeRow[] {
  return source.map((size, index) => {
    const beforeExcessQty = 0;
    const excess = excessDefault;
    const excessQty = (beforeExcessQty * excess) / 100;
    const totalQty = beforeExcessQty + excessQty;

    return {
      id: index + 1,
      size,
      beforeExcessQty,
      excess,
      excessQty,
      totalQty,
      buyerPoPrice: 0,
      value: 0,
    };
  });
}

function updateRows(rows: SizeRow[]) {
  return rows.map((row) => {
    const beforeQty = Number(row.beforeExcessQty || 0);
    const excessPct = Number(row.excess || 0);
    const excessQty = (beforeQty * excessPct) / 100;
    const totalQty = beforeQty + excessQty;
    const buyerPrice = Number(row.buyerPoPrice || 0);
    const value = totalQty * buyerPrice;

    return {
      ...row,
      excessQty,
      totalQty,
      value,
    };
  });
}

export default function OrderEntryForm({ defaultStatus, onSaved, onCancel, organizationId }: OrderEntryFormProps) {
  const [form, setForm] = useState<OrderFormState>(initialFormState);
  const [rows, setRows] = useState<SizeRow[]>(() => createRowsFromSizes(sizeOptions));
  const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderTab>("details");

  const headerSummary = useMemo(() => {
    const totalQty = rows.reduce((sum, row) => sum + Number(row.totalQty || 0), 0);
    const totalWithoutExcess = rows.reduce((sum, row) => sum + Number(row.beforeExcessQty || 0), 0);
    const totalValue = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);

    return {
      totalQty,
      totalWithoutExcess,
      totalValue,
    };
  }, [rows]);

  const applyHeaderTotalsFromRows = (nextRows: SizeRow[]) => {
    const totalQty = nextRows.reduce((sum, row) => sum + Number(row.totalQty || 0), 0);
    const totalWithoutExcess = nextRows.reduce((sum, row) => sum + Number(row.beforeExcessQty || 0), 0);
    const orderValue = nextRows.reduce((sum, row) => sum + Number(row.value || 0), 0);

    setForm((prev) => ({
      ...prev,
      orderQty: totalQty,
      orderQtyWithoutExcess: totalWithoutExcess,
      orderValue,
    }));
  };

  const handleFieldChange = (field: keyof OrderFormState, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSizeGroupChange = (value: string) => {
    setForm((prev) => ({ ...prev, sizeGroup: value }));
    if (!value) {
      setRows([]);
      return;
    }

    const nextRows = updateRows(createRowsFromSizes(sizeOptions));
    setRows(nextRows);
    applyHeaderTotalsFromRows(nextRows);
  };

  const handleRowChange = (id: number, field: keyof SizeRow, value: string | number) => {
    const nextRows = rows.map((row) => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      return updated;
    });

    const recalculatedRows = updateRows(nextRows);
    setRows(recalculatedRows);
    applyHeaderTotalsFromRows(recalculatedRows);
  };

  const handleRowAdd = () => {
    const defaultExcess = rows[0]?.excess ?? 0;
    const nextRows = [
      ...rows,
      {
        id: Date.now(),
        size: `Size ${rows.length + 1}`,
        beforeExcessQty: 0,
        excess: defaultExcess,
        excessQty: 0,
        totalQty: 0,
        buyerPoPrice: 0,
        value: 0,
      },
    ];

    const recalculatedRows = updateRows(nextRows);
    setRows(recalculatedRows);
    applyHeaderTotalsFromRows(recalculatedRows);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.entityName || !form.article || !form.brand || !form.buyer) {
      setStatus("idle");
      setMessage("Please complete the required fields before saving the order.");
      return;
    }

    const invalidExcess = rows.some((row) => Number(row.excess || 0) < 0 || Number(row.excess || 0) > 30);
    if (invalidExcess) {
      setStatus("idle");
      setMessage("Excess must be between 0 and 30% for each size line.");
      return;
    }

    if (rows.length === 0) {
      setStatus("idle");
      setMessage("Select a size group and add size rows before creating the order.");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          organizationId: organizationId ?? "",
          status: defaultStatus ?? "Draft",
          fob: Number(form.fob || 0),
          orderQty: Number(form.orderQty || 0),
          orderQtyWithoutExcess: Number(form.orderQtyWithoutExcess || 0),
          orderValue: Number(form.orderValue || 0),
          items: rows.map((row) => ({
            size: row.size,
            beforeExcessQty: Number(row.beforeExcessQty || 0),
            excess: Number(row.excess || 0),
            excessQty: Number(row.excessQty || 0),
            totalQty: Number(row.totalQty || 0),
            buyerPoPrice: Number(row.buyerPoPrice || 0),
            value: Number(row.value || 0),
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save the order.");
      }

      setStatus("success");
      setMessage(payload.message || "Order saved successfully. The order form is ready for the next entry.");
      window.setTimeout(() => {
        onSaved?.();
      }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to save the order.";
      setStatus("idle");
      setMessage(errorMessage);
    }
  };

  const tabs = [
    { key: "details", label: "Order Details" },
    { key: "qty", label: "Size wise Qty" },
    { key: "summary", label: "Summary" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#dce4dc] pb-5 sm:flex-row sm:items-center">
        <div>
          <p className="page-kicker">Merchandising / Orders</p>
          <h1 className="page-title text-2xl sm:text-3xl">{isEditMode ? "Edit order" : "Create order"}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="button-secondary">
              Cancel
            </button>
          )}
          <button type="button" onClick={() => setIsEditMode(!isEditMode)} className="button-secondary">
            {isEditMode ? "Switch to add" : "Edit mode"}
          </button>
          <button type="submit" className="button-primary" disabled={status === "saving"}>
            {status === "saving" ? "Saving..." : isEditMode ? "Update order" : "Create order"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition ${activeTab === tab.key ? "bg-[#17372a] text-white" : "border border-[#dce4dc] bg-white text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
        <section className="surface p-5 sm:p-6">
          <div className="mb-6 flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">01 / Header</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">Order details</h2>
            </div>
            <span className="grid size-9 place-items-center rounded-lg bg-[#e8f0e5] text-sm font-bold text-emerald-800">O</span>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm font-medium text-zinc-800">Entity name<input value={form.entityName} onChange={(e) => handleFieldChange("entityName", e.target.value)} className="field" placeholder="Company entity" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Category<input value={form.category} onChange={(e) => handleFieldChange("category", e.target.value)} className="field" placeholder="Product category" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Sub category<input value={form.subCategory} onChange={(e) => handleFieldChange("subCategory", e.target.value)} className="field" placeholder="Sub category" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Season<input value={form.season} onChange={(e) => handleFieldChange("season", e.target.value)} className="field" placeholder="Season" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Article / Gold seal<input value={form.article} onChange={(e) => handleFieldChange("article", e.target.value)} className="field" placeholder="Article" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Style name<input value={form.styleName} onChange={(e) => handleFieldChange("styleName", e.target.value)} className="field" placeholder="Style name" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Colors<input value={form.colors} onChange={(e) => handleFieldChange("colors", e.target.value)} className="field" placeholder="Colors" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Buyer<input value={form.buyer} onChange={(e) => handleFieldChange("buyer", e.target.value)} className="field" placeholder="Buyer" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Brand<input value={form.brand} onChange={(e) => handleFieldChange("brand", e.target.value)} className="field" placeholder="Brand name" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Size group<select value={form.sizeGroup} onChange={(e) => handleSizeGroupChange(e.target.value)} className="field"><option value="">Select size group</option><option value="Core">Core</option><option value="Extended">Extended</option><option value="Premium">Premium</option></select></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Type<select value={form.typeField} onChange={(e) => handleFieldChange("typeField", e.target.value as OrderFormState["typeField"])} className="field"><option value="Direct">Direct</option><option value="Bulk">Bulk</option></select></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">FOB<input type="number" value={form.fob} onChange={(e) => handleFieldChange("fob", Number(e.target.value))} className="field" placeholder="0" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Delivery date<input type="date" value={form.deliveryDate} onChange={(e) => handleFieldChange("deliveryDate", e.target.value)} className="field" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Buyer PO date<input type="date" value={form.buyerPoDate} onChange={(e) => handleFieldChange("buyerPoDate", e.target.value)} className="field" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Buyer PO no<input value={form.buyerPoNo} onChange={(e) => handleFieldChange("buyerPoNo", e.target.value)} className="field" placeholder="PO number" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Merchandiser<input value={form.merchandiser} onChange={(e) => handleFieldChange("merchandiser", e.target.value)} className="field" placeholder="Assigned merchandiser" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Order volume<select value={form.orderVolume} onChange={(e) => handleFieldChange("orderVolume", e.target.value)} className="field"><option value="Sample">Sample</option><option value="SMS Sample">SMS Sample</option><option value="Small">Small</option><option value="Medium">Medium</option><option value="Large">Large</option></select></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">GST<input value={form.gst} onChange={(e) => handleFieldChange("gst", e.target.value)} className="field" placeholder="GST code" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">HSN code<input value={form.hsnCode} onChange={(e) => handleFieldChange("hsnCode", e.target.value)} className="field" placeholder="HSN" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Import reference<input value={form.sourceImportId} onChange={(e) => handleFieldChange("sourceImportId", e.target.value)} className="field" placeholder="Reference order ID" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800 md:col-span-2 xl:col-span-4">Remarks<textarea value={form.remarks} onChange={(e) => handleFieldChange("remarks", e.target.value)} className="field min-h-28 resize-y" placeholder="Any notes for planning or production" /></label>
          </div>
        </section>
      )}

      {activeTab === "qty" && (
        <section className="surface p-5 sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">02 / Quantity</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-950">Size-wise quantity and excess</h2>
            </div>
            <button type="button" onClick={handleRowAdd} className="button-secondary w-fit">Add size row</button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Size</th>
                  <th className="px-3 py-3">Before excess qty</th>
                  <th className="px-3 py-3">Excess %</th>
                  <th className="px-3 py-3">Excess qty</th>
                  <th className="px-3 py-3">Total qty</th>
                  <th className="px-3 py-3">Buyer PO rate</th>
                  <th className="px-3 py-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (<tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-500">Select a size group to populate the size-wise grid.</td></tr>)}
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-3"><input value={row.size} onChange={(e) => handleRowChange(row.id, "size", e.target.value)} className="field" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.beforeExcessQty} onChange={(e) => handleRowChange(row.id, "beforeExcessQty", Number(e.target.value))} className="field" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.excess} onChange={(e) => handleRowChange(row.id, "excess", Number(e.target.value))} className="field" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.excessQty} readOnly className="field cursor-not-allowed bg-zinc-50" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.totalQty} readOnly className="field cursor-not-allowed bg-zinc-50" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.buyerPoPrice} onChange={(e) => handleRowChange(row.id, "buyerPoPrice", Number(e.target.value))} className="field" /></td>
                    <td className="px-3 py-3"><input type="number" value={row.value} readOnly className="field cursor-not-allowed bg-zinc-50" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "summary" && (
        <section className="surface p-5 sm:p-6">
          <div className="mb-4 border-b border-zinc-100 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">03 / Summary</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">Order totals</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-[#f7faf7] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Order qty</p><p className="mt-3 text-3xl font-semibold text-zinc-950">{headerSummary.totalQty}</p></div>
            <div className="rounded-xl border border-zinc-200 bg-[#f7faf7] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Without excess</p><p className="mt-3 text-3xl font-semibold text-zinc-950">{headerSummary.totalWithoutExcess}</p></div>
            <div className="rounded-xl border border-zinc-200 bg-[#f7faf7] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Order value</p><p className="mt-3 text-3xl font-semibold text-zinc-950">₹{headerSummary.totalValue.toLocaleString("en-IN")}</p></div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium text-zinc-800">Order qty<input type="number" value={form.orderQty} readOnly className="field cursor-not-allowed bg-zinc-50" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Order qty without excess<input type="number" value={form.orderQtyWithoutExcess} readOnly className="field cursor-not-allowed bg-zinc-50" /></label>
            <label className="space-y-2 text-sm font-medium text-zinc-800">Order value<input type="number" value={form.orderValue} readOnly className="field cursor-not-allowed bg-zinc-50" /></label>
          </div>
        </section>
      )}

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {message}
        </div>
      )}
    </form>
  );
}
