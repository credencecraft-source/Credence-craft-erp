"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-definitions";

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

    let extractedFields: Record<string, unknown> = {};
    if (record.metadata && typeof record.metadata === "object") {
      const meta = record.metadata as Record<string, unknown>;
      if (meta.fields && typeof meta.fields === "object") {
        extractedFields = { ...(meta.fields as Record<string, unknown>) };
      } else {
        extractedFields = { ...meta };
      }
    }

    fields.forEach((field) => {
      if (extractedFields[field.key] === undefined) {
        if (field.key === "label" || field === fields[0]) {
          extractedFields[field.key] = record.label;
        } else if (field.key === "code") {
          extractedFields[field.key] = record.code;
        } else if (field.key === "description") {
          extractedFields[field.key] = record.description;
        }
      }
    });

    setEditFields(extractedFields);
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
        <label key={field.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.checked })}
            name={`field_${field.key}`}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          {field.label}
        </label>
      );
    if (field.type === "picklist")
      return (
        <label key={field.key} className="block space-y-1">
          <span className="text-xs font-semibold text-slate-700">{field.label}</span>
          <select
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
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
        <label key={field.key} className="block space-y-1">
          <span className="text-xs font-semibold text-slate-700">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <select
            required={field.required}
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
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
      <label key={field.key} className="block space-y-1">
        <span className="text-xs font-semibold text-slate-700">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <Input
          required={field.required}
          type={field.type === "percentage" || field.type === "number" ? "number" : "text"}
          step={field.type === "percentage" ? "0.01" : undefined}
          name={`field_${field.key}`}
          value={String(value ?? "")}
          onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
        />
      </label>
    );
  };

  return (
    <div className="space-y-4">
      {/* HEADER CONTROLS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Report View</h3>
          <span className="text-xs text-slate-500">{visibleRecords.length} records</span>
        </div>

        <div className="flex items-center gap-3">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search records..."
            className="w-64"
          />
          <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
            + Add Record
          </Button>
        </div>
      </div>

      {/* TABLE DATA */}
      {visibleRecords.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
          No records found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-700 uppercase tracking-wider text-xs border-b border-slate-200">
              <tr>
                {fields.map((field) => (
                  <th key={field.key} className="p-3 font-semibold whitespace-nowrap">
                    {field.label}
                  </th>
                ))}
                <th className="p-3 font-semibold whitespace-nowrap">Code</th>
                <th className="p-3 font-semibold whitespace-nowrap">Description</th>
                <th className="p-3 font-semibold whitespace-nowrap">Status</th>
                <th className="p-3 font-semibold whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700">
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
                    } hover:bg-slate-100/80 transition-colors`}
                  >
                    {fields.map((field) => (
                      <td key={field.key} className="p-3 whitespace-nowrap">
                        {String(metadata.fields?.[field.key] ?? (field === fields[0] ? item.label : "—"))}
                      </td>
                    ))}
                    <td className="p-3 whitespace-nowrap text-slate-500">
                      {item.code || "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-500">
                      {item.description || "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          item.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.is_active ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <form action={deleteAction}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="organizationId" value={organizationId} />
                          <input type="hidden" name="moduleKey" value={moduleKey} />
                          <input type="hidden" name="valueId" value={item.value_id} />
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-medium transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add New {moduleLabel}</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-base"
              >
                ✕
              </button>
            </div>
            <form action={createAction} className="space-y-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {fields.map((field) => renderField(field, createFields, setCreateFields))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Edit: {editingRecord.label}</h3>
              <button
                type="button"
                onClick={closeEditor}
                className="text-slate-400 hover:text-slate-600 font-bold text-base"
              >
                ✕
              </button>
            </div>
            <form action={updateAction} className="space-y-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={editingRecord.value_id} />

              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {fields.map((field) => renderField(field, editFields, setEditFields))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-medium transition-colors"
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