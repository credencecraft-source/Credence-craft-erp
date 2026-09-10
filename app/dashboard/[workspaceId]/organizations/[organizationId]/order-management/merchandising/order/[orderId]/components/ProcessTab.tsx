"use client";

import React, { useState } from "react";

export default function ProcessTab({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const activeProcessTab = form?.activeProcessTab || "cutting";

  const templates = [
    { id: "woven", name: "Woven Garment Production Template" },
    { id: "knit", name: "Knitwear Manufacturing Template" },
    { id: "sweater", name: "Sweater / Outerwear Template" },
  ];

  const subProcesses = [
    { id: "cutting", label: "Cutting Section" },
    { id: "sewing", label: "Sewing / Assembly" },
    { id: "finishing", label: "Finishing & Packing" },
  ];

  const processRows = form?.processRows || [];

  const addProcessRow = () => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      section: activeProcessTab,
      operation: "",
      cost: 0,
    };
    setForm((current: any) => ({
      ...current,
      processRows: [...(current.processRows || []), newItem],
    }));
  };

  const updateProcessRow = (id: string, field: string, value: any) => {
    setForm((current: any) => ({
      ...current,
      processRows: (current.processRows || []).map((row: any) =>
        row.id === id ? { ...row, [field]: value } : row
      ),
    }));
  };

  const removeProcessRow = (id: string) => {
    setForm((current: any) => ({
      ...current,
      processRows: (current.processRows || []).filter((row: any) => row.id !== id),
    }));
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedTemplate(val);

    if (val && processRows.length === 0) {
      const templateSteps = [
        { id: Math.random().toString(36).substr(2, 9), section: "cutting", operation: "Fabric Spreading & Cutting", cost: 15 },
        { id: "2", section: "cutting", operation: "Bundling & Numbering", cost: 5 },
        { id: "3", section: "sewing", operation: "Main Stitching & Assembly", cost: 45 },
        { id: "4", section: "finishing", operation: "Thread Trimming & Ironing", cost: 10 },
      ];
      setForm((current: any) => ({ ...current, processRows: templateSteps }));
    }
  };

  const filteredRows = processRows.filter((r: any) => (r.section || "cutting") === activeProcessTab);

  // Calculate total process cost across all sections
  const totalProcessCost = processRows.reduce((sum: number, r: any) => sum + (Number(r.cost) || 0), 0);

  return (
    <div className="space-y-4">
      {/* TEMPLATE SELECTOR & TOTAL HEADER */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            Process Template:
          </label>
          <select
            value={selectedTemplate}
            onChange={handleTemplateChange}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 bg-white w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">-- Select Workflow Template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
            Total Process Cost: <span className="text-emerald-600 font-extrabold">${totalProcessCost.toFixed(2)}</span>
          </div>
          <button
            type="button"
            onClick={addProcessRow}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-1"
          >
            <span>+</span> Add Operation
          </button>
        </div>
      </div>

      {/* SUB-TABS LEVEL FOR PROCESS SECTIONS */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {subProcesses.map((sub) => {
          const count = processRows.filter((r: any) => (r.section || "cutting") === sub.id).length;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() =>
                setForm((current: any) => ({ ...current, activeProcessTab: sub.id }))
              }
              className={`px-3 py-1.5 font-semibold rounded-lg text-xs transition-colors ${
                activeProcessTab === sub.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {sub.label} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* TABLE CONTENT FOR ACTIVE SUB-TAB */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                <th className="p-3 w-16 text-center">Step</th>
                <th className="p-3">Operation</th>
                <th className="p-3 w-40 text-right">Cost ($)</th>
                <th className="p-3 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-middle">
              {filteredRows.length > 0 ? (
                filteredRows.map((row: any, index: number) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-center font-mono font-bold text-slate-600">
                      {index + 1}
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={row.operation}
                        onChange={(e) => updateProcessRow(row.id, "operation", e.target.value)}
                        placeholder="e.g. Fabric Cutting"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        value={row.cost}
                        onChange={(e) => updateProcessRow(row.id, "cost", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-28 text-right rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeProcessRow(row.id)}
                        className="text-red-500 hover:text-red-700 font-semibold text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                    No operations added under this section yet. Click "+ Add Operation" or select a template.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}