"use client";

import { useState } from "react";
import Link from "next/link";

export function OrganizationsGrid({
  organizations,
  workspaceId,
  deleteOrgAction,
}: {
  organizations: any[];
  workspaceId: string;
  deleteOrgAction: (formData: FormData) => Promise<void>;
}) {
  const [deleteModalOrg, setDeleteModalOrg] = useState<any | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {organizations.map((organization) => (
          <div key={organization.id} className="group relative flex flex-col justify-between rounded-lg border border-slate-200/80 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 font-bold text-xs shadow-2xs">
                  {organization.organization_name ? organization.organization_name.charAt(0).toUpperCase() : "O"}
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                    Active
                  </span>
                  <button 
                    type="button" 
                    onClick={() => {
                      setDeleteModalOrg(organization);
                      setConfirmInput("");
                    }}
                    title="Delete Organization"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              <h3 className="mt-2.5 text-sm font-semibold text-slate-900 tracking-tight truncate" title={organization.organization_name}>
                {organization.organization_name}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono truncate">
                GST: {organization.gst_number || "N/A"}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
              <Link
                href={`/dashboard/${workspaceId}/organizations/${organization.organization_id}`}
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 w-full justify-between"
              >
                <span>Open Workspace</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {deleteModalOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Are you sure to delete this organization?</h3>
                <p className="text-xs text-slate-500 font-medium">{deleteModalOrg.organization_name}</p>
              </div>
            </div>

            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
              <p className="font-semibold">⚠️ Critical Warning:</p>
              <p>On deletion, all your records will get deleted and cannot be recovered.</p>
            </div>

            <form action={deleteOrgAction} className="space-y-4">
              <input type="hidden" name="orgId" value={deleteModalOrg.id} />
              
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
                </label>
                <input 
                  type="text" 
                  name="verificationText"
                  required
                  placeholder="Type DELETE here"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-hidden focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOrg(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirmInput !== "DELETE"}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Permanently Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}