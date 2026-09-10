"use client";

import React from "react";

export default function AsnTab({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const asnRows = form?.asnRows || [];

  const addAsnRow = () => {
    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      asnNumber: `ASN-${Math.floor(100000 + Math.random() * 900000)}`,
      shipmentDate: "",
      carrier: "",
      totalCartons: 1,
      status: "Dispatched",
    };
    setForm((current: any) => ({
      ...current,
      asnRows: [...(current.asnRows || []), newItem],
    }));
  };

  const updateAsnRow = (id: string, field: string, value: any) => {
    setForm((current: any) => ({
      ...current,
      asnRows: (current.asnRows || []).map((row: any) =>
        row.id === id ? { ...row, [field]: value } : row
      ),
    }));
  };

  const removeAsnRow = (id: string) => {
    setForm((current: any) => ({
      ...current,
      asnRows: (current.asnRows || []).filter((row: any) => row.id !== id),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xs font-bold text-slate-900">Advance Shipment Notices (ASN)</h3>
          <p className="text-[11px] text-slate-500">Manage outbound shipment notifications and dispatch details.</p>
        </div>
        <button
          type="button"
          onClick={addAsnRow}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <span>+</span> Create ASN
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">
                <th className="p-3 w-12 text-center">#</th>
                <th className="p-3 w-36">ASN Number</th>
                <th className="p-3 w-36">Shipment Date</th>
                <th className="p-3">Carrier / Logistics</th>
                <th className="p-3 w-28 text-center">Total Cartons</th>
                <th className="p-3 w-32">Status</th>
                <th className="p-3 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-middle">
              {asnRows.length > 0 ? (
                asnRows.map((row: any, index: number) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-center font-mono font-bold text-slate-600">{index + 1}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">{row.asnNumber}</td>
                    <td className="p-3">
                      <input
                        type="date"
                        value={row.shipmentDate}
                        onChange={(e) => updateAsnRow(row.id, "shipmentDate", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={row.carrier}
                        onChange={(e) => updateAsnRow(row.id, "carrier", e.target.value)}
                        placeholder="e.g. DHL / FedEx"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        value={row.totalCartons}
                        onChange={(e) => updateAsnRow(row.id, "totalCartons", parseInt(e.target.value) || 0)}
                        className="w-20 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white"
                      />
                    </td>
                    <td className="p-3">
                      <select
                        value={row.status}
                        onChange={(e) => updateAsnRow(row.id, "status", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white font-medium"
                      >
                        <option value="Dispatched">Dispatched</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </td>
                    <td className="p-3 text-center">
                      <button type="button" onClick={() => removeAsnRow(row.id)} className="text-red-500 hover:text-red-700">✕</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">No ASNs created yet. Click "+ Create ASN".</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}