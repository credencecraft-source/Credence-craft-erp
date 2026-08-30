"use client";

import { useState } from "react";

export default function UIManagementPage() {
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [primaryColor, setPrimaryColor] = useState("#047857");

  return (
    <div className="erp-page">
      {/* HEADER */}
      <div className="erp-card flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-slate-900">UI & Theme Management Center</h1>
          <p className="text-[11px] text-slate-500">
            Centralized design system controls and component library for Credence Craft ERP.
          </p>
        </div>
        <button className="erp-btn-primary">Save System Config</button>
      </div>

      {/* SYSTEM CONTROLS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {/* DENSITY CONTROL */}
        <div className="erp-card flex flex-col gap-2">
          <span className="font-bold text-slate-800">Layout Density</span>
          <div className="flex gap-2">
            <button
              onClick={() => setDensity("compact")}
              className={`erp-btn-secondary flex-1 justify-center ${
                density === "compact" ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-bold" : ""
              }`}
            >
              Compact (11px)
            </button>
            <button
              onClick={() => setDensity("comfortable")}
              className={`erp-btn-secondary flex-1 justify-center ${
                density === "comfortable" ? "bg-emerald-50 border-emerald-600 text-emerald-800 font-bold" : ""
              }`}
            >
              Comfortable (13px)
            </button>
          </div>
        </div>

        {/* COLOR SCHEME */}
        <div className="erp-card flex flex-col gap-2">
          <span className="font-bold text-slate-800">Brand Primary Accent</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-slate-300"
            />
            <span className="font-mono text-[11px] text-slate-600">{primaryColor}</span>
          </div>
        </div>

        {/* STATUS */}
        <div className="erp-card flex flex-col gap-2 justify-center">
          <span className="font-bold text-slate-800">Design Tokens Status</span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-[11px] text-slate-600">Tailwind v4 @theme active in globals.css</span>
          </div>
        </div>
      </div>

      {/* LIVE COMPONENT PREVIEW GALLERY */}
      <div className="erp-card flex flex-col gap-3">
        <h2 className="font-bold text-slate-900 border-b border-slate-200 pb-1">Standardized Component Preview</h2>

        {/* BUTTONS PREVIEW */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-500 font-medium">Standard Action Buttons</label>
          <div className="flex items-center gap-2">
            <button className="erp-btn-primary">+ Create Record</button>
            <button className="erp-btn-secondary">Export Data</button>
            <button className="h-7 px-3 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100">
              Delete
            </button>
          </div>
        </div>

        {/* INPUTS PREVIEW */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-500 font-medium">Form Controls & Inputs</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="erp-input" placeholder="Standard Text Input..." />
            <select className="erp-input">
              <option>Select Order Status...</option>
              <option>Draft</option>
              <option>Approved</option>
            </select>
            <input type="date" className="erp-input" />
          </div>
        </div>

        {/* DATA TABLE PREVIEW */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-500 font-medium">Compact Table Preview</label>
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="p-1.5 font-semibold">Order ID</th>
                  <th className="p-1.5 font-semibold">Buyer Name</th>
                  <th className="p-1.5 font-semibold">Status</th>
                  <th className="p-1.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                <tr>
                  <td className="p-1.5 font-medium">ORD-2026-001</td>
                  <td className="p-1.5">Apex Apparel Ltd</td>
                  <td className="p-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                      Approved
                    </span>
                  </td>
                  <td className="p-1.5 text-right">
                    <button className="erp-btn-secondary text-[10px] h-6 px-2">View</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}