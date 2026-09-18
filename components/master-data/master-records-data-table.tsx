"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-registry";

type MasterRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  metadata?: unknown;
};

type ChildRecord = { parentId: string | null; label: string; fields?: Record<string, unknown> };

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
  lookupOptions: Record<string, Array<{ id: string; value_id?: string; label: string; parent_id?: string | null }>>;
  childRecords?: ChildRecord[];
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
  childRecords = [],
}: MasterRecordsTableProps) {
  const router = useRouter();
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

  const getLookupOptions = (field: MasterFieldDefinition, values: Record<string, unknown>) => {
    const options = lookupOptions[field.lookupModuleKey ?? ""] ?? [];
    if (!field.dependsOn) return options;

    const parentField = fields.find((candidate) => candidate.key === field.dependsOn);
    const parentOptions = lookupOptions[parentField?.lookupModuleKey ?? ""] ?? [];
    const parentValue = String(values[field.dependsOn] ?? "");
    const parentOption = parentOptions.find((option) => option.label === parentValue);
    if (!parentValue) return options;
    if (!parentOption) return [];

    const parentIds = new Set(
      [parentOption.id, parentOption.value_id]
        .filter(Boolean)
        .map((value) => String(value)),
    );
    return options.filter((option) => option.parent_id && parentIds.has(String(option.parent_id)));
  };

  const renderField = (
    field: MasterFieldDefinition,
    values: Record<string, unknown>,
    setValues: (values: Record<string, unknown>) => void
  ) => {
    const value = values[field.key] ?? field.initialValue;
    if (field.type === "checkbox")
      return (
        <label key={field.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => {
              if (field.readOnly) return;
              setValues({ ...values, [field.key]: event.target.checked });
            }}
            name={`field_${field.key}`}
            disabled={field.readOnly}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
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
            onChange={(event) => {
              if (field.readOnly) return;
              setValues({ ...values, [field.key]: event.target.value });
            }}
            disabled={field.readOnly}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
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
    if (field.type === "lookup") {
      const selectedValue = field.multiple && value === undefined && editingRecord
        ? childRecords.filter((item) => item.parentId === editingRecord.value_id).map((item) => item.label)
        : value;
      const options = getLookupOptions(field, values);
      if (field.multiple) {
        const selectedValues = Array.isArray(selectedValue)
          ? selectedValue.map(String)
          : selectedValue
            ? [String(selectedValue)]
            : [];

        return (
          <fieldset key={field.key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-700">
              {field.label}
              {field.required ? " *" : ""}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((option) => {
                const checked = selectedValues.includes(option.label);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
                      checked
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={`field_${field.key}`}
                      value={option.label}
                      checked={checked}
                      onChange={(event) => {
                        const nextValue = event.target.checked
                          ? [...selectedValues, option.label]
                          : selectedValues.filter((item) => item !== option.label);
                        const nextValues = { ...values, [field.key]: nextValue };
                        for (const dependentField of fields.filter((candidate) => candidate.dependsOn === field.key)) {
                          nextValues[dependentField.key] = dependentField.multiple ? [] : "";
                        }
                        setValues(nextValues);
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            {options.length === 0 && <p className="text-xs text-slate-500">No {field.label.toLowerCase()} options available.</p>}
            {field.required && <p className="text-[11px] text-slate-500">Select at least one.</p>}
          </fieldset>
        );
      }
      return (
        <label key={field.key} className="block space-y-1">
          <span className="text-xs font-semibold text-slate-700">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <select
            required={field.required}
            name={`field_${field.key}`}
            value={String(selectedValue ?? "")}
            onChange={(event) => {
              const nextValue = event.target.value;
              const nextValues = { ...values, [field.key]: nextValue };
              for (const dependentField of fields.filter((candidate) => candidate.dependsOn === field.key)) {
                nextValues[dependentField.key] = dependentField.multiple ? [] : "";
              }
              setValues(nextValues);
            }}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white"
          >
            <option value="">Select {field.label}</option>
            {options.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (field.type === "child-list") {
      const childFields = field.childFields ?? [];
      const childValues = Array.isArray(value) && value.length > 0
        ? value.map((item) => typeof item === "object" && item !== null ? item : { [childFields[0]?.key ?? "value"]: String(item ?? "") })
        : editingRecord
          ? childRecords.filter((item) => item.parentId === editingRecord.id || item.parentId === editingRecord.value_id).map((item) => item.fields ?? { [childFields[0]?.key ?? "value"]: item.label })
          : [{}];
      const normalizedValues = childValues.length > 0 ? childValues as Array<Record<string, unknown>> : [{}];
      return (
        <div key={field.key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">{field.label}</span>
            <button
              type="button"
               onClick={() => setValues({ ...values, [field.key]: [...normalizedValues, {}] })}
              className="rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white"
            >
                Add row
              </button>
            </div>
            <input type="hidden" name={`field_${field.key}`} value={JSON.stringify(normalizedValues.filter((row) => Object.values(row).some((item) => String(item ?? "").trim() !== "")))} />
            {normalizedValues.map((childValue, index) => (
              <div key={`${field.key}-${index}`} className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[56px_1fr_auto]">
                <span className="flex items-center justify-center text-xs font-semibold text-slate-500">{index + 1}</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {childFields.map((childField) => {
                    const childValueForField = childValue[childField.key] ?? "";
                    if (childField.type === "lookup") {
                      return <label key={childField.key} className="space-y-1 text-xs font-semibold text-slate-700"><span>{childField.label}{childField.required ? " *" : ""}</span><select required={childField.required} value={String(childValueForField)} onChange={(event) => { const nextValues = [...normalizedValues]; nextValues[index] = { ...nextValues[index], [childField.key]: event.target.value }; setValues({ ...values, [field.key]: nextValues }); }} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="">Select {childField.label}</option>{(lookupOptions[childField.lookupModuleKey ?? ""] ?? []).map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}</select></label>;
                    }
                    return <label key={childField.key} className="space-y-1 text-xs font-semibold text-slate-700"><span>{childField.label}{childField.required ? " *" : ""}</span><Input required={childField.required} type={childField.type === "number" || childField.type === "percentage" || childField.type === "decimal" ? "number" : "text"} step={childField.type === "percentage" || childField.type === "decimal" ? "0.01" : undefined} value={String(childValueForField)} onChange={(event) => { const nextValues = [...normalizedValues]; nextValues[index] = { ...nextValues[index], [childField.key]: event.target.value }; setValues({ ...values, [field.key]: nextValues }); }} /></label>;
                  })}
                </div>
               <button
                  type="button"
                  onClick={() => setValues({ ...values, [field.key]: normalizedValues.filter((_, itemIndex) => itemIndex !== index) })}
                className="px-2 py-1 text-xs font-medium text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      );
    }
    return (
      <label key={field.key} className="block space-y-1">
        <span className="text-xs font-semibold text-slate-700">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <Input
          required={field.required}
          type={field.type === "date" ? "date" : field.type === "percentage" || field.type === "number" || field.type === "decimal" ? "number" : "text"}
          step={field.type === "percentage" || field.type === "decimal" ? "0.01" : undefined}
          name={`field_${field.key}`}
          value={String(value ?? "")}
          readOnly={field.readOnly}
          disabled={field.readOnly}
          onChange={(event) => {
            if (field.readOnly) return;
            setValues({ ...values, [field.key]: event.target.value });
          }}
        />
      </label>
    );
  };

  const getFieldValue = (record: MasterRecord, field: MasterFieldDefinition) => {
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as { fields?: Record<string, unknown> })
        : {};
    const value = metadata.fields?.[field.key];
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const openRecordDetail = (record: MasterRecord) => {
    if (moduleKey === "article") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/articles/${encodeURIComponent(record.value_id)}`);
    }
    if (moduleKey === "gold-seal") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(record.value_id)}`);
    }
  };

  return (
    <div className="space-y-4">
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

      {visibleRecords.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
          No records found.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRecords.map((item) => {
            const formattedCode = item.code || "—";
            return (
              <article
                key={item.id}
                onClick={() => openRecordDetail(item)}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-base font-bold text-emerald-700">
                      {moduleLabel.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{moduleLabel}</p>
                      <h4 className="mt-0.5 text-base font-bold text-slate-900">{item.label}</h4>
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      item.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {item.is_active ? "Active" : "Pending"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Code</span>
                  <span className="text-sm font-semibold text-slate-800">{formattedCode}</span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {fields
                    .filter((field) => !["article", "article_code", "description", "design_by", "designed_date"].includes(field.key))
                    .slice(0, 4)
                    .map((field) => {
                      const value = getFieldValue(item, field);
                      if (value === "—") return null;
                      return (
                        <div key={field.key} className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{field.label}</p>
                          <p className="mt-1 text-sm font-medium text-slate-700 break-words">{value}</p>
                        </div>
                      );
                    })}
                </div>

                {item.description ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Description</p>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  {moduleKey === "article" || moduleKey === "gold-seal" ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRecordDetail(item);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-xs font-medium transition-colors"
                    >
                      Open
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditor(item);
                    }}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
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
                      onClick={(event) => event.stopPropagation()}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="erp-popup-backdrop">
          <div className="erp-popup-panel w-full max-w-lg space-y-4 p-5">
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
        <div className="erp-popup-backdrop">
          <div className="erp-popup-panel w-full max-w-lg space-y-4 p-5">
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
