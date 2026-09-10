"use client";

import React, { useState } from "react";

type CostingItem = {
  id: string;
  category: string;
  costType: string;
  description: string;
  amount: string;
};

const COST_CATEGORIES = [
  "Product Cost",
  "Raw Material",
  "Process Cost",
  "Service Cost",
  "Fixed Cost",
  "Rejection/Wasteage",
  "Other Cost",
];

const RAW_MATERIAL_BOM_CATEGORIES = [
  "Fabric",
  "Accessories",
  "Trims",
  "Packaging",
];

export default function CostingTab({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const costingRows: CostingItem[] = form?.costingRows || [];
  const actualCostingRows: CostingItem[] = form?.actualCostingRows || [];
  
  const [mainTab, setMainTab] = useState<string>("BUYER");
  const [activeCategory, setActiveCategory] = useState<string>(COST_CATEGORIES[0]);
  const [activeBomCategory, setActiveBomCategory] = useState<string>(RAW_MATERIAL_BOM_CATEGORIES[0]);

  const addCostingRow = (category: string, isActual = false) => {
    const newItem: CostingItem = {
      id: Math.random().toString(36).substr(2, 9),
      category,
      costType: category === "Raw Material" ? activeBomCategory : "",
      description: "",
      amount: "",
    };
    if (isActual) {
      setForm((current: any) => ({
        ...current,
        actualCostingRows: [...(current.actualCostingRows || []), newItem],
      }));
    } else {
      setForm((current: any) => ({
        ...current,
        costingRows: [...(current.costingRows || []), newItem],
      }));
    }
  };

  const updateCostingRow = (id: string, field: keyof CostingItem, value: string, isActual = false) => {
    const key = isActual ? "actualCostingRows" : "costingRows";
    setForm((current: any) => ({
      ...current,
      [key]: (current[key] || []).map((row: CostingItem) =>
        row.id === id ? { ...row, [field]: value } : row
      ),
    }));
  };

  const removeCostingRow = (id: string, isActual = false) => {
    const key = isActual ? "actualCostingRows" : "costingRows";
    setForm((current: any) => ({
      ...current,
      [key]: (current[key] || []).filter((row: CostingItem) => row.id !== id),
    }));
  };

  const buyerTotalCost = costingRows.reduce(
    (acc, row) => acc + (Number(row.amount) || 0),
    0
  );

  const actualTotalCost = actualCostingRows.reduce(
    (acc, row) => acc + (Number(row.amount) || 0),
    0
  );

  const marginAmount = buyerTotalCost - actualTotalCost;
  const marginPercentage = buyerTotalCost > 0 ? (marginAmount / buyerTotalCost) * 100 : 0;

  const currentRows = mainTab === "ACTUAL" ? actualCostingRows : costingRows;
  const displayedCategories = COST_CATEGORIES.filter((cat) => cat === activeCategory);

  return (
    <div className="space-y-6">
      {/* 🌟 ONE CLEAN HEADING & BUDGET RULE NOTICE */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            All these for One PCS Cost. Freeze your costing. Once it's frozen, your team cannot purchase or spend beyond the budgeted rules unless costing is revised.
          </h3>
        </div>
        <span className="shrink-0 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200">
          Costing Frozen & Active
        </span>
      </div>

      {/* 1. DASHBOARD SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-700/60">
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/50">
            Buyer Price
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight mt-2 text-white">
            ₹{buyerTotalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">{costingRows.length} total entries</p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-700/60">
          <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
            Actual Cost
          </span>
          <h2 className="text-2xl font-extrabold tracking-tight mt-2 text-white">
            ₹{actualTotalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">{actualCostingRows.length} total entries</p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-700/60">
          <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/50">
            Margin / Profit
          </span>
          <h2 className={`text-2xl font-extrabold tracking-tight mt-2 ${marginAmount >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            ₹{marginAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs font-normal ml-2 opacity-80">
              ({marginPercentage.toFixed(1)}%)
            </span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">Difference (Buyer - Actual)</p>
        </div>
      </div>

      {/* 2. MAIN SHEET TABS (BUYER COST SHEET vs ACTUAL COST SHEET) */}
      <div className="flex gap-3 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setMainTab("BUYER")}
          className={`px-5 py-2.5 font-bold rounded-xl text-xs transition-all flex items-center gap-2 ${
            mainTab === "BUYER"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span>📋</span> Buyer Cost Sheet
          <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 text-[10px]">
            ₹{buyerTotalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab("ACTUAL")}
          className={`px-5 py-2.5 font-bold rounded-xl text-xs transition-all flex items-center gap-2 ${
            mainTab === "ACTUAL"
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span>📊</span> Actual Cost Sheet
          <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px]">
            ₹{actualTotalCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </button>
      </div>

      {/* 3. CATEGORY TABS WITH TOTAL AMOUNTS EMBEDDED */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {COST_CATEGORIES.map((category) => {
          const categoryTotal = currentRows
            .filter((r) => r.category === category)
            .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeCategory === category
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{category}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeCategory === category ? "bg-emerald-500 text-slate-950" : "bg-slate-100 text-slate-700"
              }`}>
                ₹{categoryTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. BOM SUB-LEVEL TABS (WITH TOTAL AMOUNTS) WHEN "Raw Material" IS SELECTED */}
      {activeCategory === "Raw Material" && (
        <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/60 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider px-2">BOM Level:</span>
          {RAW_MATERIAL_BOM_CATEGORIES.map((bomCat) => {
            const bomTotal = currentRows
              .filter((r: CostingItem) => r.category === "Raw Material" && (r.costType === bomCat || (!r.costType && bomCat === "Fabric")))
              .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

            return (
              <button
                key={bomCat}
                type="button"
                onClick={() => setActiveBomCategory(bomCat)}
                className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeBomCategory === bomCat
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-100/50"
                }`}
              >
                <span>{bomCat}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  activeBomCategory === bomCat ? "bg-emerald-900 text-emerald-200" : "bg-emerald-100 text-emerald-800"
                }`}>
                  ₹{bomTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 5. ACTIVE CATEGORY BREAKDOWN SECTION */}
      <div className="space-y-4">
        {displayedCategories.map((category) => {
          let categoryRows = currentRows.filter((r: CostingItem) => r.category === category);
          if (category === "Raw Material") {
            categoryRows = categoryRows.filter((r: CostingItem) => r.costType === activeBomCategory || (!r.costType && activeBomCategory === "Fabric"));
          }
          const catTotal = categoryRows.reduce((sum: number, r: CostingItem) => sum + (Number(r.amount) || 0), 0);

          return (
            <div key={category} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
              <div className="flex items-center justify-between bg-slate-50/80 px-6 py-4 border-b border-slate-200/70">
                <div className="flex items-center gap-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    {category} {category === "Raw Material" ? `— ${activeBomCategory}` : ""}
                  </h4>
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                    ₹{catTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => addCostingRow(category, mainTab === "ACTUAL")}
                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-1"
                >
                  <span>+</span> Add Breakdown
                </button>
              </div>

              {categoryRows.length > 0 ? (
                <div className="overflow-x-auto p-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                        {category === "Raw Material" ? (
                          <th className="p-2.5 min-w-[160px]">BOM Item / Material</th>
                        ) : (
                          <th className="p-2.5 min-w-[160px]">Result Type / Subhead</th>
                        )}
                        <th className="p-2.5 min-w-[200px]">Description</th>
                        <th className="p-2.5 min-w-[130px]">Cost (₹)</th>
                        <th className="p-2.5 min-w-[80px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 align-top">
                      {categoryRows.map((row: CostingItem) => (
                        <tr key={row.id} className="hover:bg-slate-50/40">
                          <td className="p-2">
                            {category === "Raw Material" ? (
                              <select
                                value={row.costType || activeBomCategory}
                                onChange={(e) => updateCostingRow(row.id, "costType", e.target.value, mainTab === "ACTUAL")}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white"
                              >
                                {RAW_MATERIAL_BOM_CATEGORIES.map((bCat) => (
                                  <option key={bCat} value={bCat}>{bCat}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={row.costType}
                                onChange={(e) => updateCostingRow(row.id, "costType", e.target.value, mainTab === "ACTUAL")}
                                placeholder="e.g. Labor / Machine"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white"
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => updateCostingRow(row.id, "description", e.target.value, mainTab === "ACTUAL")}
                              placeholder="Add optional notes..."
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={row.amount}
                              onChange={(e) => updateCostingRow(row.id, "amount", e.target.value, mainTab === "ACTUAL")}
                              placeholder="0.00"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 font-semibold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all bg-white"
                            />
                          </td>
                          <td className="p-2 pt-3">
                            <button
                              type="button"
                              onClick={() => removeCostingRow(row.id, mainTab === "ACTUAL")}
                              className="text-red-500 hover:text-red-700 font-semibold text-xs transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50/30">
                  No breakdown items added under {category} ({activeBomCategory}). Click "+ Add Breakdown" to start.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}