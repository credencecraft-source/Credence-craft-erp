"use client";

import { useMemo, useState } from "react";
import type { MasterFieldDefinition } from "@/lib/master-definitions";

type MasterRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  metadata?: unknown;
};

type MasterRecordsTableProps = {
  records: MasterRecord[];
  moduleLabel: string;
  workspaceId: string;
  organizationId: string;
  moduleKey: string;
  createAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, Array<{ id: string; label: string }>>;
};

export function MasterRecordsTable({
  records,
  moduleLabel,
  workspaceId,
  organizationId,
  moduleKey,
  createAction,
  updateAction,
  deleteAction,
  fields,
  lookupOptions,
}: MasterRecordsTableProps) {
  const [editingRecord, setEditingRecord] = useState<MasterRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFields, setCreateFields] = useState<Record<string, unknown>>({});
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const visibleRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => [record.label, record.code, record.description].some((value) => value?.toLowerCase().includes(query)));
  }, [records, searchTerm]);

  const openEditor = (record: MasterRecord) => {
    setEditingRecord(record);
    const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as { fields?: Record<string, unknown> } : {};
    setEditFields(metadata.fields ?? {});
  };

  const closeEditor = () => {
    setEditingRecord(null);
    setEditFields({});
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateFields({});
  };

  const renderField = (field: MasterFieldDefinition, values: Record<string, unknown>, setValues: (values: Record<string, unknown>) => void) => {
    const value = values[field.key];
    if (field.type === "checkbox") return <label key={field.key} className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={value === true} onChange={(event) => setValues({ ...values, [field.key]: event.target.checked })} name={`field_${field.key}`} />{field.label}</label>;
    if (field.type === "picklist") return <label key={field.key} className="space-y-2 text-sm font-medium text-slate-700"><span>{field.label}</span><select name={`field_${field.key}`} value={String(value ?? "")} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"><option value="">Select {field.label}</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></label>;
    if (field.type === "lookup") return <label key={field.key} className="space-y-2 text-sm font-medium text-slate-700"><span>{field.label}{field.required ? " *" : ""}</span><select required={field.required} name={`field_${field.key}`} value={String(value ?? "")} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"><option value="">Select {field.label}</option>{(lookupOptions[field.lookupModuleKey ?? ""] ?? []).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select></label>;
    return <label key={field.key} className="space-y-2 text-sm font-medium text-slate-700"><span>{field.label}{field.required ? " *" : ""}</span><input required={field.required} type={field.type === "percentage" || field.type === "number" ? "number" : "text"} step={field.type === "percentage" ? "0.01" : undefined} name={`field_${field.key}`} value={String(value ?? "")} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5" /></label>;
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white shadow-[0_12px_35px_rgba(20,83,45,0.06)]">
      <div className="border-b border-emerald-100 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Report View</h3>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              {visibleRecords.length} records
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="relative min-w-[190px]">
              <span className="sr-only">Search master records</span>
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search records" className="w-full rounded-xl border border-emerald-100 bg-emerald-50/40 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:bg-white" />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-emerald-700 stroke-[1.8]" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            </label>
            <button
              type="button"
              aria-label="Field configuration"
              className="rounded-xl border border-emerald-100 bg-white p-2 text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-800"
            >
              + Add Record
            </button>
          </div>
        </div>
      </div>

      {visibleRecords.length === 0 ? (
        <div className="rounded-b-2xl border-t border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-base font-medium text-slate-700">No records yet.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0 text-left text-[12.5px] text-slate-700">
            <thead className="bg-emerald-50/70 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <tr>
                {fields.map((field) => <th key={field.key} className="border-b border-r border-slate-200 px-3 py-3">{field.label}</th>)}
                <th className="border-b border-r border-slate-200 px-3 py-3">Code</th>
                <th className="border-b border-r border-slate-200 px-3 py-3">Description</th>
                <th className="border-b border-r border-slate-200 px-3 py-3">Status</th>
                <th className="border-b border-slate-200 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((item, index) => (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                  {fields.map((field) => { const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as { fields?: Record<string, unknown> } : {}; return <td key={field.key} className="border-b border-r border-slate-200 px-3 py-3 font-medium text-slate-900">{String(metadata.fields?.[field.key] ?? (field === fields[0] ? item.label : "—"))}</td>; })}
                  <td className="border-b border-r border-slate-200 px-3 py-3 text-slate-600">{item.description || "—"}</td>
                  <td className="border-b border-r border-slate-200 px-3 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {item.is_active ? "Active" : "Pending"}
                    </span>
                  </td>
                  <td className="border-b border-slate-200 px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditor(item)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Edit
                      </button>

                      <form action={deleteAction} className="contents">
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="moduleKey" value={moduleKey} />
                        <input type="hidden" name="valueId" value={item.value_id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Create record</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Add new {moduleLabel}</h3>
              </div>
              <button type="button" onClick={closeCreateModal} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                Close
              </button>
            </div>

            <form action={createAction} className="space-y-4 p-5">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div className="grid gap-4 md:grid-cols-2">{fields.map((field) => renderField(field, createFields, setCreateFields))}</div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeCreateModal} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                  Save record
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingRecord ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Edit record</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{editingRecord.label}</h3>
              </div>
              <button type="button" onClick={closeEditor} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                Close
              </button>
            </div>

            <form action={updateAction} className="space-y-4 p-5">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={editingRecord.value_id} />

              <div className="grid gap-4 md:grid-cols-2">{fields.map((field) => renderField(field, editFields, setEditFields))}</div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={closeEditor} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
