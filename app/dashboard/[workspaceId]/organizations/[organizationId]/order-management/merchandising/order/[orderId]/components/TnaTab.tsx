"use client";

import React, { useState } from "react";

export default function TnaTab({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const [activeSubTab, setActiveSubTab] = useState<"planned" | "actual" | "comparison">("planned");
  const tnaRows = form?.tnaRows || [];

  const addTnaRow = () => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      taskName: "",
      department: "",
      plannedDate: "",
      actualDate: "",
      status: "Pending",
      remarks: "",
    };
    setForm((current: any) => ({
      ...current,
      tnaRows: [...(current.tnaRows || []), newItem],
    }));
  };

  const updateTnaRow = (id: string, field: string, value: any) => {
    setForm((current: any) => ({
      ...current,
      tnaRows: (current.tnaRows || []).map((row: any) => {
        if (row.id !== id) return row;
        
        let updatedRow = { ...row, [field]: value };

        // AUTO-FILL ACTUAL DATE IF STATUS BECOMES COMPLETED AND ACTUAL DATE IS EMPTY
        if (field === "status" && value === "Completed" && !row.actualDate) {
          const today = new Date().toISOString().split("T")[0];
          updatedRow.actualDate = today;
        }

        return updatedRow;
      }),
    }));
  };

  const removeTnaRow = (id: string) => {
    setForm((current: any) => ({
      ...current,
      tnaRows: (current.tnaRows || []).filter((row: any) => row.id !== id),
    }));
  };

  return (
    <div className="space-y-4">
      {/* HEADER BAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xs font-bold text-slate-900">
            Time & Action (T&A) Calendar
          </h3>
          <p className="text-[11px] text-slate-500">
            Manage manual planned schedules and track automated actual milestones.
          </p>
        </div>

        <button
          type="button"
          onClick={addTnaRow}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-1"
        >
          <span>+</span> Add Milestone
        </button>
      </div>

      {/* SUB-TABS (Planned, Actual, Comparison) */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab("planned")}
          className={`px-3 py-1.5 font-semibold rounded-lg text-xs transition-colors ${
            activeSubTab === "planned"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Planned Schedule (Manual)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("actual")}
          className={`px-3 py-1.5 font-semibold rounded-lg text-xs transition-colors ${
            activeSubTab === "actual"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Actual Tracker (Auto)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("comparison")}
          className={`px-3 py-1.5 font-semibold rounded-lg text-xs transition-colors ${
            activeSubTab === "comparison"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Comparison & Summary
        </button>
      </div>

      {/* SUB-TAB 1: PLANNED (MANUAL) */}
      {activeSubTab === "planned" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 min-w-[220px]">Milestone / Task Name</th>
                  <th className="p-3 min-w-[160px]">Department</th>
                  <th className="p-3 w-40">Planned Date (Manual)</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-middle">
                {tnaRows.length > 0 ? (
                  tnaRows.map((row: any, index: number) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3 text-center font-mono font-bold text-slate-600">{index + 1}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={row.taskName}
                          onChange={(e) => updateTnaRow(row.id, "taskName", e.target.value)}
                          placeholder="e.g. Fabric Approval"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={row.department}
                          onChange={(e) => updateTnaRow(row.id, "department", e.target.value)}
                          placeholder="e.g. Merchandising"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          value={row.plannedDate}
                          onChange={(e) => updateTnaRow(row.id, "plannedDate", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => updateTnaRow(row.id, "remarks", e.target.value)}
                          placeholder="Notes..."
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeTnaRow(row.id)}
                          className="text-red-500 hover:text-red-700 font-semibold text-xs"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      No milestones added. Click "+ Add Milestone" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ACTUAL (AUTO) */}
      {activeSubTab === "actual" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 min-w-[220px]">Milestone / Task Name</th>
                  <th className="p-3 w-32">Status</th>
                  <th className="p-3 w-40">Actual Date (Auto)</th>
                  <th className="p-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-middle">
                {tnaRows.length > 0 ? (
                  tnaRows.map((row: any, index: number) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3 text-center font-mono font-bold text-slate-600">{index + 1}</td>
                      <td className="p-3 font-semibold text-slate-800">{row.taskName || "Unnamed Milestone"}</td>
                      <td className="p-3">
                        <select
                          value={row.status}
                          onChange={(e) => updateTnaRow(row.id, "status", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white font-medium"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed (Auto-sets date)</option>
                          <option value="Delayed">Delayed</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          type="date"
                          value={row.actualDate}
                          onChange={(e) => updateTnaRow(row.id, "actualDate", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-slate-50 text-slate-600 font-mono"
                        />
                      </td>
                      <td className="p-3 text-slate-600">{row.remarks || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                      No milestones available. Please add items in the Planned tab first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: COMPARISON & SUMMARY */}
      {activeSubTab === "comparison" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 min-w-[200px]">Milestone / Task Name</th>
                  <th className="p-3 w-36 text-center">Planned Date</th>
                  <th className="p-3 w-36 text-center">Actual Date</th>
                  <th className="p-3 w-32 text-center">Status</th>
                  <th className="p-3 text-center w-36">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-middle">
                {tnaRows.length > 0 ? (
                  tnaRows.map((row: any, index: number) => {
                    let varianceText = "-";
                    let varianceColor = "text-slate-600";
                    if (row.plannedDate && row.actualDate) {
                      const pDate = new Date(row.plannedDate).getTime();
                      const aDate = new Date(row.actualDate).getTime();
                      const diffDays = Math.round((aDate - pDate) / (1000 * 3600 * 24));
                      if (diffDays === 0) {
                        varianceText = "On Time";
                        varianceColor = "text-emerald-600 font-bold";
                      } else if (diffDays > 0) {
                        varianceText = `Delayed by ${diffDays}d`;
                        varianceColor = "text-red-600 font-bold";
                      } else {
                        varianceText = `Ahead by ${Math.abs(diffDays)}d`;
                        varianceColor = "text-blue-600 font-bold";
                      }
                    }

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-center font-mono font-bold text-slate-600">{index + 1}</td>
                        <td className="p-3 font-semibold text-slate-800">{row.taskName || "Unnamed Milestone"}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{row.plannedDate || "-"}</td>
                        <td className="p-3 text-center font-mono text-slate-600">{row.actualDate || "-"}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded text-[10px] font-semibold ${
                            row.status === "Completed" ? "bg-emerald-100 text-emerald-800" :
                            row.status === "Delayed" ? "bg-red-100 text-red-800" :
                            row.status === "In Progress" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className={`p-3 text-center ${varianceColor}`}>{varianceText}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      No data available for comparison summary.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}