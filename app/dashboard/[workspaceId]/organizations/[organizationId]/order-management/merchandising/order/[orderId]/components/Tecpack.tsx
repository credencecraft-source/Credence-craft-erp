"use client";

import React from "react";

export default function TecPackTab({
  form,
}: {
  form: any;
  setForm: any;
}) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* PRINT ACTION BUTTON */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm print:hidden">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Technical Package Document</h3>
          <p className="text-[11px] text-slate-500">Continuous multi-page PDF document layout</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <span>🖨️</span> Print / Download PDF
        </button>
      </div>

      {/* CONTINUOUS PDF VIEWER CONTAINER */}
      <div className="bg-slate-200/80 p-8 rounded-2xl flex flex-col items-center gap-8 print:p-0 print:bg-white print:gap-0">
        
        {/* PAGE 1 */}
        <div className="w-full max-w-[800px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0 print:mb-16">
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tech Pack — Style Overview</h2>
              <span className="text-xs font-bold text-slate-900">Page 1 of 5</span>
            </div>
            <div className="py-6 space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Style Name / Title</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{form?.styleName || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Season / Year</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{form?.season || "N/A"}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between">
            <span>Confidential — Internal Manufacturing Use Only</span>
            <span>Ref: {form?.styleName || "Draft"}</span>
          </div>
        </div>

        {/* PAGE 2 */}
        <div className="w-full max-w-[800px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0 print:mb-16">
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tech Pack — Flats & Sketches</h2>
              <span className="text-xs font-bold text-slate-900">Page 2 of 5</span>
            </div>
            <div className="py-6 space-y-4">
              <p className="text-xs text-slate-600">Design flats, front/back views, and manufacturing guidance illustrations.</p>
              <div className="h-[450px] border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs bg-slate-50">
                [Technical Sketches / Design Flats]
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between">
            <span>Confidential — Internal Manufacturing Use Only</span>
            <span>Ref: {form?.styleName || "Draft"}</span>
          </div>
        </div>

        {/* PAGE 3 */}
        <div className="w-full max-w-[800px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0 print:mb-16">
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tech Pack — Measurement Spec Sheet</h2>
              <span className="text-xs font-bold text-slate-900">Page 3 of 5</span>
            </div>
            <div className="py-6">
              <div className="h-[400px] border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-xs bg-slate-50 italic">
                Points of measurement (POM) grading chart.
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between">
            <span>Confidential — Internal Manufacturing Use Only</span>
            <span>Ref: {form?.styleName || "Draft"}</span>
          </div>
        </div>

        {/* PAGE 4 */}
        <div className="w-full max-w-[800px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0 print:mb-16">
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tech Pack — Construction & Stitching Details</h2>
              <span className="text-xs font-bold text-slate-900">Page 4 of 5</span>
            </div>
            <div className="py-6 space-y-4">
              <p className="text-xs font-semibold text-slate-500">Stitch Density, Seam Types & Instructions</p>
              <div className="w-full min-h-[250px] border border-slate-200 p-6 rounded-xl text-xs text-slate-800 bg-slate-50 whitespace-pre-wrap">
                {form?.constructionDetails || "No construction details specified."}
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between">
            <span>Confidential — Internal Manufacturing Use Only</span>
            <span>Ref: {form?.styleName || "Draft"}</span>
          </div>
        </div>

        {/* PAGE 5 */}
        <div className="w-full max-w-[800px] min-h-[1056px] bg-white border border-slate-300 shadow-xl p-12 flex flex-col justify-between page-break print:border-none print:shadow-none print:min-h-0 print:p-0">
          <div className="space-y-6">
            <div className="border-b pb-4 flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tech Pack — Bill of Materials (BOM) Ref</h2>
              <span className="text-xs font-bold text-slate-900">Page 5 of 5</span>
            </div>
            <div className="py-6">
              <div className="p-8 text-center text-slate-600 text-xs bg-slate-50 border border-slate-100 rounded-xl">
                Total Linked BOM Entries from Costing Sheet: <span className="font-bold text-slate-900">{form?.bomRows?.length || 0}</span>
              </div>
            </div>
          </div>
          <div className="border-t pt-4 text-[10px] text-slate-400 flex justify-between">
            <span>Confidential — Internal Manufacturing Use Only</span>
            <span>Ref: {form?.styleName || "Draft"}</span>
          </div>
        </div>

      </div>
    </div>
  );
}