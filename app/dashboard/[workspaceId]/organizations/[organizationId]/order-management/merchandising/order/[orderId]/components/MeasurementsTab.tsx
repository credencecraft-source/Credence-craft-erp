"use client";

import React, { useState } from "react";

type MeasurementItem = {
  id: string;
  code: string;
  pom: string;
  tolerance: string;
  s: string;
  m: string;
  l: string;
  xl: string;
};

export default function MeasurementsTab({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const measurementRows: MeasurementItem[] = form?.measurementRows || [];

  const addMeasurementRow = () => {
    const newItem: MeasurementItem = {
      id: Math.random().toString(36).substr(2, 9),
      code: `POM-${measurementRows.length + 1}`,
      pom: "",
      tolerance: "+/- 0.5",
      s: "",
      m: "",
      l: "",
      xl: "",
    };
    setForm((current: any) => ({
      ...current,
      measurementRows: [...(current.measurementRows || []), newItem],
    }));
  };

  const updateMeasurementRow = (id: string, field: keyof MeasurementItem, value: string) => {
    setForm((current: any) => ({
      ...current,
      measurementRows: (current.measurementRows || []).map((row: MeasurementItem) =>
        row.id === id ? { ...row, [field]: value } : row
      ),
    }));
  };

  const removeMeasurementRow = (id: string) => {
    setForm((current: any) => ({
      ...current,
      measurementRows: (current.measurementRows || []).filter((row: MeasurementItem) => row.id !== id),
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 🌟 HEADER BANNER WITH PRINT BUTTON */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Measurement Spec Sheet & Size Grading — Points of Measurement (POM) for Production
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addMeasurementRow}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all flex items-center gap-1"
          >
            <span>+</span> Add POM
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2"
          >
            <span>🖨️</span> Print / Download PDF
          </button>
        </div>
      </div>

      {/* MEASUREMENT PDF-STYLE PAGE LAYOUT */}
      <div className="bg-slate-200/80 p-8 rounded-2xl flex flex-col items-center gap-8 print:p-0 print:bg-white print:gap-0">
        <div className="w-full max-w-[900px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0">
          
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Measurement Spec Sheet</h2>
                <p className="text-sm font-extrabold text-slate-900 mt-0.5">Style: {form?.styleName || "Draft Style"}</p>
              </div>
              <span className="text-xs font-bold text-slate-900">Season: {form?.season || "N/A"}</span>
            </div>

            {/* MEASUREMENT TABLE */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5 min-w-[200px]">Point of Measurement (POM)</th>
                    <th className="p-2.5">Tol (+/-)</th>
                    <th className="p-2.5 text-center">S</th>
                    <th className="p-2.5 text-center">M</th>
                    <th className="p-2.5 text-center">L</th>
                    <th className="p-2.5 text-center">XL</th>
                    <th className="p-2.5 text-center print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-middle">
                  {measurementRows.length > 0 ? (
                    measurementRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50">
                        <td className="p-2 font-mono font-bold text-slate-600">{row.code}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.pom}
                            onChange={(e) => updateMeasurementRow(row.id, "pom", e.target.value)}
                            placeholder="e.g. Chest Width 1/2"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.tolerance}
                            onChange={(e) => updateMeasurementRow(row.id, "tolerance", e.target.value)}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="text"
                            value={row.s}
                            onChange={(e) => updateMeasurementRow(row.id, "s", e.target.value)}
                            placeholder="0"
                            className="w-14 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="text"
                            value={row.m}
                            onChange={(e) => updateMeasurementRow(row.id, "m", e.target.value)}
                            placeholder="0"
                            className="w-14 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="text"
                            value={row.l}
                            onChange={(e) => updateMeasurementRow(row.id, "l", e.target.value)}
                            placeholder="0"
                            className="w-14 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="text"
                            value={row.xl}
                            onChange={(e) => updateMeasurementRow(row.id, "xl", e.target.value)}
                            placeholder="0"
                            className="w-14 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 bg-white print:border-none print:p-0 print:bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() => removeMeasurementRow(row.id)}
                            className="text-red-500 hover:text-red-700 font-semibold text-xs"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                        No measurement specifications added yet. Click "+ Add POM" to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between mt-12">
            <span>Confidential — Quality Control & Production Measurement Guide</span>
            <span>Total POM Entries: {measurementRows.length}</span>
          </div>

        </div>
      </div>
    </div>
  );
}