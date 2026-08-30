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
    return records.filter((record) =>
      [record.label, record.code, record.description].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [records, searchTerm]);

  const openEditor = (record: MasterRecord) => {
    setEditingRecord(record);
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as { fields?: Record<string, unknown> })
        : {};
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

  const renderField = (
    field: MasterFieldDefinition,
    values: Record<string, unknown>,
    setValues: (values: Record<string, unknown>) => void
  ) => {
    const value = values[field.key];
    if (field.type === "checkbox")
      return (
        <label key={field.key} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.checked })}
            name={`field_${field.key}`}
            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
          />
          {field.label}
        </label>
      );
    if (field.type === "picklist")
      return (
        <label key={field.key} className="space-y-1 text-[11px] font-medium text-slate-700">
          <span className="block font-semibold">{field.label}</span>
          <select
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full h-7 rounded border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    if (field.type === "lookup")
      return (
        <label key={field.key} className="space-y-1 text-[11px] font-medium text-slate-700">
          <span className="block font-semibold">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <select
            required={field.required}
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full h-7 rounded border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">Select {field.label}</option>
            {(lookupOptions[field.lookupModuleKey ?? ""] ?? []).map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    return (
      <label key={field.key} className="space-y-1 text-[11px] font-medium text-slate-700">
        <span className="block font-semibold">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <input
          required={field.required}
          type={field.type === "percentage" || field.type === "number" ? "number" : "text"}
          step={field.type === "percentage" ? "0.01" : undefined}
          name={`field_${field.key}`}
          value={String(value ?? "")}
          onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          className="w-full h-7 rounded border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
        />
      </label>
    );
  };

  return (
    <div className="rounded border border-slate-200 bg-white shadow-2xs text-[11px]">
      {/* HEADER CONTROLS */}
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800">Report View</h3>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">
              {visibleRecords.length} records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search records..."
              className="h-7 min-w-[180px] rounded border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-7 rounded bg-emerald-700 px-2.5 text-[11px] font-semibold text-white shadow-2xs hover:bg-emerald-800"
            >
              + Add Record
            </button>
          </div>
        </div>
      </div>

      {/* TABLE DATA */}
      {visibleRecords.length === 0 ? (
        <div className="p-6 text-center text-slate-500 font-medium">
          No records found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
              <tr>
                {fields.map((field) => (
                  <th key={field.key} className="border-r border-slate-200 px-2.5 py-1.5">
                    {field.label}
                  </th>
                ))}
                <th className="border-r border-slate-200 px-2.5 py-1.5">Code</th>
                <th className="border-r border-slate-200 px-2.5 py-1.5">Description</th>
                <th className="border-r border-slate-200 px-2.5 py-1.5">Status</th>
                <th className="px-2.5 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.map((item, index) => {
                const metadata =
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as { fields?: Record<string, unknown> })
                    : {};
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } hover:bg-slate-100/80`}
                  >
                    {fields.map((field) => (
                      <td key={field.key} className="border-r border-slate-200 px-2.5 py-1 font-medium text-slate-800">
                        {String(metadata.fields?.[field.key] ?? (field === fields[0] ? item.label : "—"))}
                      </td>
                    ))}
                    <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-slate-600">
                      {item.code || "—"}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1 text-slate-600 truncate max-w-[200px]">
                      {item.description || "—"}
                    </td>
                    <td className="border-r border-slate-200 px-2.5 py-1">
                      <span
                        className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                          item.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.is_active ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="px-2.5 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="h-5 rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <form action={deleteAction} className="inline">
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="moduleKey" value={moduleKey} />
                          <input type="hidden" name="valueId" value={item.value_id} />
                          <button
                            type="submit"
                            className="h-5 rounded border border-rose-200 bg-rose-50 px-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h3 className="text-[12px] font-bold text-slate-800">Add New {moduleLabel}</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <form action={createAction} className="space-y-3 p-3">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => renderField(field, createFields, setCreateFields))}
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="h-7 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-7 rounded bg-emerald-700 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-800"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <h3 className="text-[12px] font-bold text-slate-800">Edit: {editingRecord.label}</h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <form action={updateAction} className="space-y-3 p-3">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={editingRecord.value_id} />

              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => renderField(field, editFields, setEditFields))}
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="h-7 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-7 rounded bg-emerald-700 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-800"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}