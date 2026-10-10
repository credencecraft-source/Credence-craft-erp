"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
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
  lookupOptions: Record<string, Array<{ id: string; value_id?: string; label: string; parent_id?: string | null; fields?: Record<string, unknown> }>>;
  childRecords?: ChildRecord[];
};

const rawMaterialShowAllFieldKeys = new Set([
  "Category_Type",
  "Workdrive_Image_ID",
  "Size_Wise_Concemption",
  "Size_Wise_Consemption_Master",
  "Is_this_Specific_for_a_Brand",
  "Create_open_stock",
  "Vendor_Wise_Price_List",
  "Item_Code",
  "Open_Stock",
  "Open_Stock_Price",
  "Brand1",
  "Buyer_Item_Code",
]);
const rawMaterialFieldOrder = ["Category", "Subcategory", "Raw_Material_Name", "Stock_Uom1", "Colour", "Image_Url", "Show_All1"];

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? "Saving..." : children}
    </Button>
  );
}

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
  const [visibleReportFields, setVisibleReportFields] = useState<string[]>([]);
  const orderedFields = moduleKey === "raw-material"
    ? [...fields].sort((first, second) => {
      const firstOrder = rawMaterialFieldOrder.indexOf(first.key);
      const secondOrder = rawMaterialFieldOrder.indexOf(second.key);
      return (firstOrder === -1 ? rawMaterialFieldOrder.length : firstOrder)
        - (secondOrder === -1 ? rawMaterialFieldOrder.length : secondOrder);
    })
    : fields;

  const openEditor = useCallback((record: MasterRecord) => {
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
  }, [fields]);

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
    if (field.readOnly) return null;

    const value = values[field.key] ?? field.initialValue;
    if (field.type === "checkbox")
      return (
        <div key={field.key} className={moduleKey === "raw-material" ? "pt-5" : undefined}>
          <Checkbox
            label={`${field.label}${field.required ? " *" : ""}`}
            checked={value === true}
            onChange={(event) => {
              if (field.readOnly) return;
              setValues({ ...values, [field.key]: event.target.checked });
            }}
            name={`field_${field.key}`}
            disabled={field.readOnly}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
          />
        </div>
      );
    if (field.type === "image")
      return (
        <Input
          key={field.key}
          label={field.label}
          type="file"
          accept="image/*"
          name={`field_${field.key}`}
          hint="PNG, JPG, GIF, or WebP up to 2 MB."
          onChange={() => undefined}
        />
      );
    if (field.type === "picklist")
      return (
        <Select
          key={field.key}
          label={field.label}
          required={field.required}
            name={`field_${field.key}`}
            value={String(value ?? "")}
            onChange={(event) => {
              if (field.readOnly) return;
              setValues({ ...values, [field.key]: event.target.value });
            }}
            disabled={field.readOnly}
            options={[
              { value: "", label: `Select ${field.label}` },
              ...(field.options?.map((option) => ({ value: option, label: option })) ?? []),
            ]}
            className="rounded-lg p-2 text-sm disabled:bg-slate-100"
          />
      );
    if (field.type === "lookup") {
      const selectedValue = field.multiple && value === undefined && editingRecord
        ? childRecords.filter((item) => item.parentId === editingRecord.id || item.parentId === editingRecord.value_id).map((item) => item.label)
        : value;
      const options = getLookupOptions(field, values);
      if (field.multiple) {
        const selectedValues = Array.isArray(selectedValue)
          ? selectedValue.map(String)
          : selectedValue
            ? [String(selectedValue)]
            : [];

        if (moduleKey === "size-group" && field.key === "Size") {
          const sizeRows = selectedValues.length > 0 ? selectedValues : [""];
          return (
            <fieldset key={field.key} className="col-span-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">
                {field.label}{field.required ? " *" : ""}
              </legend>
              <div className="flex items-center justify-end border-b border-slate-200 pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setValues({ ...values, [field.key]: [...sizeRows, ""] })}
                >
                  Add row
                </Button>
              </div>
              <div className="space-y-2">
                {sizeRows.map((size, index) => {
                  const otherSelectedSizes = new Set(selectedValues.filter((_, rowIndex) => rowIndex !== index));
                  const rowOptions = options.filter((option) => option.label === size || !otherSelectedSizes.has(option.label));
                  return (
                    <div key={`${field.key}-${index}`} className="grid min-w-0 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-600">Sl No</span>
                        <span className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold tabular-nums text-slate-600">{index + 1}</span>
                      </div>
                      <Select
                        label="Size"
                        value={size}
                        onChange={(event) => {
                          const nextValues = [...sizeRows];
                          nextValues[index] = event.target.value;
                          setValues({ ...values, [field.key]: nextValues });
                        }}
                        options={[
                          { value: "", label: "Select Size" },
                          ...rowOptions.map((option) => ({ value: option.label, label: option.label })),
                        ]}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const nextValues = sizeRows.filter((_, rowIndex) => rowIndex !== index);
                          setValues({ ...values, [field.key]: nextValues.length > 0 ? nextValues : [""] });
                        }}
                        className="justify-self-end text-red-600 sm:mb-0.5"
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
              {selectedValues.filter(Boolean).map((size, index) => (
                <input key={`${field.key}-value-${index}`} type="hidden" name={`field_${field.key}`} value={size} />
              ))}
              {field.required && <p className="text-[11px] text-slate-500">Add at least one size.</p>}
            </fieldset>
          );
        }

        return (
          <fieldset key={field.key} className="col-span-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-1 text-xs font-semibold text-slate-700">
              {field.label}
              {field.required ? " *" : ""}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((option) => {
                const checked = selectedValues.includes(option.label);
                return (
                  <div
                    key={option.id}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors ${
                      checked
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <Checkbox
                      label={option.label}
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
                  </div>
                );
              })}
            </div>
            {options.length === 0 && <p className="text-xs text-slate-500">No {field.label.toLowerCase()} options available.</p>}
            {field.required && <p className="text-[11px] text-slate-500">Select at least one.</p>}
          </fieldset>
        );
      }
      const selectedCategory = moduleKey === "raw-material" && field.key === "Category_Type"
        ? (lookupOptions["raw-material-category"] ?? []).find((option) => option.label === String(values.Category ?? ""))
        : undefined;
      const linkedTypeValue = String(selectedCategory?.fields?.Raw_Material_Type1 ?? "");
      const linkedType = options.find((option) => [option.label, option.id, option.value_id].some((candidate) => String(candidate ?? "") === linkedTypeValue));
      const autoSelectedType = linkedType?.label;

      return (
        <div key={field.key}>
          {autoSelectedType && <input type="hidden" name={`field_${field.key}`} value={autoSelectedType} />}
          <Select
            label={field.label}
            required={field.required}
            name={`field_${field.key}`}
            value={autoSelectedType ?? String(selectedValue ?? "")}
            disabled={field.readOnly || Boolean(autoSelectedType)}
            onChange={(event) => {
              const nextValue = event.target.value;
              const nextValues = { ...values, [field.key]: nextValue };
              for (const dependentField of fields.filter((candidate) => candidate.dependsOn === field.key)) {
                nextValues[dependentField.key] = dependentField.multiple ? [] : "";
              }
              if (moduleKey === "raw-material" && field.key === "Category") {
                const selectedCategory = (lookupOptions["raw-material-category"] ?? []).find((option) => option.label === nextValue);
                const categoryType = String(selectedCategory?.fields?.Raw_Material_Type1 ?? "");
                const matchingType = (lookupOptions["raw-material-type"] ?? []).find((option) => option.label === categoryType);
                nextValues.Category_Type = matchingType?.label ?? "";
              }
              setValues(nextValues);
            }}
            options={[
              { value: "", label: `Select ${field.label}` },
              ...options.map((option) => ({ value: option.label, label: option.label })),
            ]}
            className="rounded-lg p-2 text-sm"
          />
        </div>
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
        <div key={field.key} className="col-span-full min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <span className="text-sm font-semibold text-slate-800">{field.label}</span>
            <Button
              size="sm"
              variant="secondary"
               onClick={() => setValues({ ...values, [field.key]: [...normalizedValues, {}] })}
            >
                Add row
              </Button>
          </div>
          <input type="hidden" name={`field_${field.key}`} value={JSON.stringify(normalizedValues.filter((row) => Object.values(row).some((item) => String(item ?? "").trim() !== "")))} />
          <div className="space-y-2">
            {normalizedValues.map((childValue, index) => (
              <div key={`${field.key}-${index}`} className="grid min-w-0 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
                <span className="flex h-10 items-center justify-center self-end text-sm font-semibold tabular-nums text-slate-500">{index + 1}</span>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {childFields.map((childField) => {
                    const childValueForField = childValue[childField.key] ?? "";
                    const onChange = (nextValue: string) => {
                      const nextValues = [...normalizedValues];
                      nextValues[index] = { ...nextValues[index], [childField.key]: nextValue };
                      setValues({ ...values, [field.key]: nextValues });
                    };
                    if (childField.type === "lookup") {
                      return <Select key={childField.key} label={childField.label} required={childField.required} value={String(childValueForField)} onChange={(event) => onChange(event.target.value)} options={[{ value: "", label: `Select ${childField.label}` }, ...(lookupOptions[childField.lookupModuleKey ?? ""] ?? []).map((option) => ({ value: option.label, label: option.label }))]} />;
                    }
                    return <Input key={childField.key} label={childField.label} required={childField.required} type={childField.type === "number" || childField.type === "percentage" || childField.type === "decimal" ? "number" : "text"} step={childField.type === "percentage" || childField.type === "decimal" ? "0.01" : undefined} value={String(childValueForField)} onChange={(event) => onChange(event.target.value)} />;
                  })}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValues({ ...values, [field.key]: normalizedValues.filter((_, itemIndex) => itemIndex !== index) })}
                  className="justify-self-end text-red-600 sm:mb-0.5"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div key={field.key}>
        <Input
          label={field.label}
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
      </div>
    );
  };

  const getFieldValue = useCallback((record: MasterRecord, field: MasterFieldDefinition) => {
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
  }, []);

  const reportFields = useMemo(() => [
    { key: "label", label: "Name" },
    { key: "code", label: "Code" },
    ...fields.map((field) => ({ key: field.key, label: field.label })),
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Actions" },
  ].filter((field, index, allFields) => allFields.findIndex((item) => item.key === field.key) === index), [fields]);

  const defaultVisibleReportFields = useMemo(
    () => reportFields
      .filter((field) => field.key !== "description" || records.some((record) => record.description))
      .map((field) => field.key),
    [records, reportFields],
  );

  const activeVisibleReportFields = visibleReportFields.length > 0
    ? visibleReportFields
    : defaultVisibleReportFields;

  const openRecordDetail = useCallback((record: MasterRecord) => {
    if (moduleKey === "article") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/articles/${encodeURIComponent(record.value_id)}`);
    }
    if (moduleKey === "gold-seal") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(record.value_id)}`);
    }
  }, [moduleKey, organizationId, router, workspaceId]);

  const renderCell = useCallback((fieldKey: string, record: MasterRecord) => {
    if (fieldKey === "label") return record.label;
    if (fieldKey === "code") return record.code || "—";
    if (fieldKey === "description") return record.description || "—";
    if (fieldKey === "status") return record.is_active ? "Active" : "Pending";
    if (fieldKey === "actions") {
      return (
        <div className="flex items-center gap-1.5">
          {(moduleKey === "article" || moduleKey === "gold-seal") && (
            <Button type="button" size="sm" variant="secondary" onClick={() => openRecordDetail(record)}>
              Open
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={() => openEditor(record)}>
            Edit
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="moduleKey" value={moduleKey} />
            <input type="hidden" name="valueId" value={record.value_id} />
            <Button type="submit" size="sm" variant="danger">
              Delete
            </Button>
          </form>
        </div>
      );
    }
    const field = fields.find((candidate) => candidate.key === fieldKey);
    return field ? getFieldValue(record, field) : "—";
  }, [deleteAction, fields, getFieldValue, moduleKey, openEditor, openRecordDetail, organizationId, workspaceId]);

  const getSearchValue = useCallback((fieldKey: string, record: MasterRecord) => {
    if (fieldKey === "actions") return "";
    if (fieldKey === "label") return record.label;
    if (fieldKey === "code") return record.code ?? "";
    if (fieldKey === "description") return record.description ?? "";
    if (fieldKey === "status") return record.is_active ? "Active" : "Pending";
    const field = fields.find((candidate) => candidate.key === fieldKey);
    return field ? getFieldValue(record, field) : "";
  }, [fields, getFieldValue]);

  return (
    <div className="space-y-4">
      <ReportGrid
        title={`${moduleLabel} Report`}
        records={records}
        fields={reportFields}
        visibleFields={activeVisibleReportFields}
        onVisibleFieldsChange={setVisibleReportFields}
        storageKey={`master-report-columns-${moduleKey}`}
        rowIdSelector={(record) => record.id}
        selectedIds={[]}
        onRowClick={() => undefined}
        onNewOrder={() => setShowCreateModal(true)}
        newActionLabel="+ Add Record"
        renderCell={renderCell}
        getSearchValue={getSearchValue}
        emptyMessage={`No ${moduleLabel.toLowerCase()} records found.`}
      />

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="erp-popup-backdrop">
          <div className={`erp-popup-panel flex h-[calc(100dvh-1.5rem)] max-h-[56rem] ${moduleKey === "raw-material" ? "w-[min(96vw,72rem)]" : "w-[min(96vw,90rem)]"} max-w-none flex-col space-y-4 p-5`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add New {moduleLabel}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeCreateModal}
              >
                ✕
              </Button>
            </div>
            <form action={createAction} className="flex min-h-0 flex-1 flex-col space-y-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div className={`grid min-h-0 flex-1 grid-cols-1 content-start gap-x-6 gap-y-4 overflow-y-auto pr-2 ${moduleKey === "raw-material" ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
                {orderedFields.map((field) => moduleKey === "raw-material" && rawMaterialShowAllFieldKeys.has(field.key) && createFields.Show_All1 !== true
                  ? <input key={field.key} type="hidden" name={`field_${field.key}`} value={String(createFields[field.key] ?? "")} />
                  : renderField(field, createFields, setCreateFields))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closeCreateModal}
                >
                  Cancel
                </Button>
                <SubmitButton>Save Record</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingRecord && (
        <div className="erp-popup-backdrop">
          <div className={`erp-popup-panel ${moduleKey === "raw-material" ? "flex h-[calc(100dvh-1.5rem)] max-h-[56rem] w-[min(96vw,72rem)] max-w-none flex-col" : "w-full max-w-lg"} space-y-4 p-5`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Edit: {editingRecord.label}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeEditor}
              >
                ✕
              </Button>
            </div>
            <form action={updateAction} className={moduleKey === "raw-material" ? "flex min-h-0 flex-1 flex-col space-y-4" : "space-y-4"}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={editingRecord.value_id} />

              <div className={moduleKey === "raw-material" ? "grid min-h-0 flex-1 grid-cols-1 content-start gap-x-6 gap-y-4 overflow-y-auto pr-2 sm:grid-cols-2" : "max-h-96 space-y-3 overflow-y-auto pr-1"}>
                {orderedFields.map((field) => moduleKey === "raw-material" && rawMaterialShowAllFieldKeys.has(field.key) && editFields.Show_All1 !== true
                  ? <input key={field.key} type="hidden" name={`field_${field.key}`} value={String(editFields[field.key] ?? "")} />
                  : renderField(field, editFields, setEditFields))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <SubmitButton>Save Changes</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
