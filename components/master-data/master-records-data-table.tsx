"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-registry";

type MasterLookupOption = { id: string; value_id?: string; label: string; parent_id?: string | null; fields?: Record<string, unknown>; sizes?: MasterLookupOption[] };
type QuickMasterTarget = { fieldKey: string; variantIndex?: number; childFieldKey?: string };
type QuickMasterSnapshot = {
  moduleKey: string;
  fields: Record<string, unknown>;
  lookupOptions: Record<string, MasterLookupOption[]>;
  target: QuickMasterTarget;
};

type MasterRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  metadata?: unknown;
};

type ChildRecord = { id?: string; parentId: string | null; label: string; fields?: Record<string, unknown> };

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
  lookupOptions: Record<string, MasterLookupOption[]>;
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
  const [currentQuickMaster, setCurrentQuickMaster] = useState<string | null>(null);
  const [quickMasterFields, setQuickMasterFields] = useState<Record<string, unknown>>({});
  const [quickMasterLookupOptions, setQuickMasterLookupOptions] = useState<Record<string, MasterLookupOption[]>>({});
  const [quickMasterTarget, setQuickMasterTarget] = useState<QuickMasterTarget | null>(null);
  const [quickMasterStack, setQuickMasterStack] = useState<QuickMasterSnapshot[]>([]);
  const [quickMasterError, setQuickMasterError] = useState("");
  const [isSavingQuickMaster, setIsSavingQuickMaster] = useState(false);
  const [isLoadingQuickMasterOptions, setIsLoadingQuickMasterOptions] = useState(false);
  const [articleLookupOptions, setArticleLookupOptions] = useState(lookupOptions);
  const [visibleReportFields, setVisibleReportFields] = useState<string[]>([]);
  const orderedFields = moduleKey === "raw-material"
    ? [...fields].sort((first, second) => {
      const firstOrder = rawMaterialFieldOrder.indexOf(first.key);
      const secondOrder = rawMaterialFieldOrder.indexOf(second.key);
      return (firstOrder === -1 ? rawMaterialFieldOrder.length : firstOrder)
        - (secondOrder === -1 ? rawMaterialFieldOrder.length : secondOrder);
    })
    : fields;

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

  const openQuickMaster = async (masterKey: string, target: QuickMasterTarget) => {
    const definition = getMasterDefinition(masterKey);
    if (!definition) {
      setQuickMasterError(`The ${masterKey} master is not configured for quick creation.`);
      return;
    }

    if (currentQuickMaster) {
      setQuickMasterStack((current) => [
        ...current,
        {
          moduleKey: currentQuickMaster,
          fields: quickMasterFields,
          lookupOptions: quickMasterLookupOptions,
          target: quickMasterTarget ?? target,
        },
      ]);
    } else {
      setQuickMasterTarget(target);
      setQuickMasterStack([]);
    }
    setQuickMasterTarget(target);
    setCurrentQuickMaster(masterKey);
    setQuickMasterFields(Object.fromEntries(definition.fields.map((field) => [
      field.key,
      field.type === "checkbox" ? false : field.multiple ? [] : "",
    ])));
    setQuickMasterLookupOptions({});
    setQuickMasterError("");

    const lookupKeys = [...new Set(definition.fields
      .filter((field) => field.type === "lookup" && field.lookupModuleKey)
      .map((field) => field.lookupModuleKey as string))];
    setIsLoadingQuickMasterOptions(true);
    try {
      const results = await Promise.all(lookupKeys.map(async (lookupKey) => {
        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(lookupKey)}`, { cache: "no-store" });
        const data: unknown = await response.json();
        if (!response.ok) {
          throw new Error(typeof data === "object" && data !== null && "error" in data
            ? String(data.error)
            : `Unable to load ${lookupKey} options.`);
        }
        if (!Array.isArray(data)) {
          throw new Error(`Unable to load ${lookupKey} options.`);
        }
        return [lookupKey, data as MasterLookupOption[]] as const;
      }));
      setQuickMasterLookupOptions(Object.fromEntries(results));
    } catch (error) {
      setQuickMasterError(error instanceof Error ? error.message : "Unable to load quick-create options.");
    } finally {
      setIsLoadingQuickMasterOptions(false);
    }
  };

  const updateArticleLookupOptions = (masterKey: string, option: MasterLookupOption) => {
    setArticleLookupOptions((current) => {
      const next = { ...current };
      next[masterKey] = [
        ...(next[masterKey] ?? []).filter((item) => item.label !== option.label),
        option,
      ];
      if (masterKey === "size-group" && Array.isArray(option.sizes)) {
        next["article-size"] = [
          ...(next["article-size"] ?? []).filter((item) => item.parent_id !== option.id && item.parent_id !== option.value_id),
          ...option.sizes.map((size) => ({ ...size, parent_id: option.id })),
        ];
      }
      if (masterKey === "size" && option.parent_id) {
        const articleSizeOption = { ...option, id: `${option.parent_id}:${option.id}` };
        next["article-size"] = [
          ...(next["article-size"] ?? []).filter((item) => !(
            item.parent_id === option.parent_id && item.label === option.label
          )),
          articleSizeOption,
        ];
      }
      return next;
    });
  };

  const addQuickMasterResult = (
    target: QuickMasterTarget,
    option: MasterLookupOption,
    multiple: boolean,
  ) => {
    if (target.variantIndex !== undefined && target.childFieldKey) {
      const variantIndex = target.variantIndex;
      const childFieldKey = target.childFieldKey;
      setCreateFields((current) => {
        const variants = Array.isArray(current.variants) ? [...current.variants] as Array<Record<string, unknown>> : [];
        variants[variantIndex] = { ...(variants[variantIndex] ?? {}), [childFieldKey]: option.label };
        return { ...current, variants };
      });
      return;
    }
    setCreateFields((current) => {
      const currentValue = current[target.fieldKey];
      const nextValue = multiple
        ? [...new Set([...(Array.isArray(currentValue) ? currentValue.map(String) : currentValue ? [String(currentValue)] : []), option.label])]
        : option.label;
      return { ...current, [target.fieldKey]: nextValue };
    });
  };

  const saveQuickMaster = async () => {
    if (!currentQuickMaster) return;
    const definition = getMasterDefinition(currentQuickMaster);
    if (!definition) return;
    const missingField = definition.fields.find((field) => field.required && (
      Array.isArray(quickMasterFields[field.key])
        ? (quickMasterFields[field.key] as unknown[]).length === 0
        : String(quickMasterFields[field.key] ?? "").trim() === ""
    ));
    if (missingField) {
      setQuickMasterError(`${missingField.label} is required.`);
      return;
    }
    const labelKey = definition.labelField ?? definition.fields[0]?.key;
    const label = labelKey ? String(quickMasterFields[labelKey] ?? "").trim() : "";
    if (!label) {
      setQuickMasterError(`Enter ${definition.label.toLowerCase()} name.`);
      return;
    }

    setIsSavingQuickMaster(true);
    setQuickMasterError("");
    try {
      const body: Record<string, unknown> = { label, fields: quickMasterFields };
      let sizeGroupForNewSize: MasterLookupOption | undefined;
      const parentLookupField = definition.fields.find((field) => field.type === "lookup" && field.lookupModuleKey);
      const parentLookupValue = parentLookupField ? String(quickMasterFields[parentLookupField.key] ?? "") : "";
      const parentMasterOption = parentLookupField
        ? (quickMasterLookupOptions[parentLookupField.lookupModuleKey ?? ""] ?? [])
          .find((item) => [item.label, item.id, item.value_id].some((value) => String(value ?? "") === parentLookupValue))
        : undefined;
      if (currentQuickMaster === "size") {
        const selectedSizeGroup = String(
          quickMasterFields.Size_Group
            ?? (quickMasterStack.length === 0 ? createFields.Size_Group : "")
            ?? "",
        ).trim();
        sizeGroupForNewSize = (quickMasterLookupOptions["size-group"] ?? articleLookupOptions["size-group"] ?? [])
          .find((item) => [item.label, item.id, item.value_id].some((value) => String(value ?? "") === selectedSizeGroup));
        if (sizeGroupForNewSize) body.sizeGroupId = sizeGroupForNewSize.id;
      }
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(currentQuickMaster)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to create master value.");
      }

      let createdOption: MasterLookupOption = {
        id: typeof result === "object" && result !== null && "id" in result ? String(result.id) : label,
        value_id: typeof result === "object" && result !== null && "value_id" in result ? String(result.value_id) : undefined,
        label,
        ...(parentMasterOption ? { parent_id: parentMasterOption.id } : {}),
        ...(sizeGroupForNewSize ? { parent_id: sizeGroupForNewSize.id } : {}),
      };

      if (currentQuickMaster === "size-group") {
        const refreshed = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/size-group`, { cache: "no-store" });
        const groups: unknown = await refreshed.json();
        if (!refreshed.ok || !Array.isArray(groups)) {
          throw new Error("Size Group was created, but its linked sizes could not be refreshed. Reload the Article form before continuing.");
        }
        const group = (groups as MasterLookupOption[]).find((item) => item.id === createdOption.id);
        if (group) createdOption = { ...createdOption, ...group };
      }
      updateArticleLookupOptions(currentQuickMaster, createdOption);

      const parent = quickMasterStack.at(-1);
      if (parent) {
        const parentDefinition = getMasterDefinition(parent.moduleKey);
        const parentField = parentDefinition?.fields.find((field) => field.key === quickMasterTarget?.fieldKey);
        const parentTarget = quickMasterTarget;
        if (!parentTarget || !parentField) {
          throw new Error("Unable to return the new master to its parent form.");
        }
        const selectedValue = parentField.multiple
          ? [...new Set([...(Array.isArray(parent.fields[parentField.key]) ? (parent.fields[parentField.key] as unknown[]).map(String) : []), label])]
          : label;
        const parentOptions = {
          ...parent.lookupOptions,
          [parentField.lookupModuleKey ?? ""]: [
            ...(parent.lookupOptions[parentField.lookupModuleKey ?? ""] ?? []).filter((item) => item.label !== label),
            createdOption,
          ],
        };
        setQuickMasterStack((current) => current.slice(0, -1));
        setCurrentQuickMaster(parent.moduleKey);
        setQuickMasterFields({ ...parent.fields, [parentField.key]: selectedValue });
        setQuickMasterLookupOptions(parentOptions);
        setQuickMasterTarget(parent.target);
        return;
      }

      if (!quickMasterTarget) {
        throw new Error("Unable to return the new master to the Article form.");
      }
      const targetDefinitionField = fields.find((field) => field.key === quickMasterTarget.fieldKey);
      addQuickMasterResult(quickMasterTarget, createdOption, Boolean(targetDefinitionField?.multiple));
      setCurrentQuickMaster(null);
      setQuickMasterTarget(null);
      setQuickMasterStack([]);
    } catch (error) {
      setQuickMasterError(error instanceof Error ? error.message : "Unable to create master value.");
    } finally {
      setIsSavingQuickMaster(false);
    }
  };

  const closeQuickMaster = () => {
    setCurrentQuickMaster(null);
    setQuickMasterTarget(null);
    setQuickMasterStack([]);
    setQuickMasterError("");
  };

  const getQuickMasterOptions = (field: MasterFieldDefinition) => {
    const options = quickMasterLookupOptions[field.lookupModuleKey ?? ""] ?? [];
    if (!field.dependsOn) return options;
    const parentDefinition = getMasterDefinition(currentQuickMaster ?? "");
    const parentField = parentDefinition?.fields.find((candidate) => candidate.key === field.dependsOn);
    const parentValue = String(quickMasterFields[field.dependsOn] ?? "");
    const parentOption = (quickMasterLookupOptions[parentField?.lookupModuleKey ?? ""] ?? [])
      .find((option) => [option.label, option.id, option.value_id].some((value) => String(value ?? "") === parentValue));
    if (!parentValue || !parentOption) return [];
    const parentIds = new Set([parentOption.id, parentOption.value_id].filter(Boolean).map(String));
    return options.filter((option) => option.parent_id && parentIds.has(String(option.parent_id)));
  };

  const renderQuickMasterField = (field: MasterFieldDefinition) => {
    if (field.readOnly || field.type === "child-list" || field.type === "image") return null;
    const value = quickMasterFields[field.key] ?? (field.type === "checkbox" ? false : field.multiple ? [] : "");
    const options = field.type === "lookup" ? getQuickMasterOptions(field) : [];
    const openNested = () => {
      if (field.lookupModuleKey) void openQuickMaster(field.lookupModuleKey, { fieldKey: field.key });
    };
    return (
      <div key={field.key} className="space-y-1">
        {field.type === "lookup" && field.lookupModuleKey && (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" onClick={openNested}>
              + Add New
            </Button>
          </div>
        )}
        {field.type === "lookup" ? (
          <Select
            label={field.label}
            required={field.required}
            multiple={field.multiple}
            value={field.multiple ? (Array.isArray(value) ? value.map(String) : []) : String(value ?? "")}
            onChange={(event) => {
              const nextValue = field.multiple
                ? Array.from(event.target.selectedOptions, (option) => option.value)
                : event.target.value;
              setQuickMasterFields((current) => {
                const next = { ...current, [field.key]: nextValue };
                for (const dependent of definitionFields.filter((item) => item.dependsOn === field.key)) {
                  next[dependent.key] = dependent.multiple ? [] : "";
                }
                return next;
              });
            }}
            options={[
              ...(!field.multiple ? [{ value: "", label: `Select ${field.label}` }] : []),
              ...options.map((option) => ({ value: option.label, label: option.label })),
            ]}
          />
        ) : field.type === "checkbox" ? (
          <Checkbox
            label={field.label}
            checked={value === true}
            onChange={(event) => setQuickMasterFields((current) => ({ ...current, [field.key]: event.target.checked }))}
          />
        ) : field.type === "picklist" ? (
          <Select
            label={field.label}
            required={field.required}
            value={String(value ?? "")}
            onChange={(event) => setQuickMasterFields((current) => ({ ...current, [field.key]: event.target.value }))}
            options={[
              { value: "", label: `Select ${field.label}` },
              ...(field.options ?? []).map((option) => ({ value: option, label: option })),
            ]}
          />
        ) : (
          <Input
            label={field.label}
            required={field.required}
            type={field.type === "date" ? "date" : ["number", "percentage", "decimal"].includes(field.type) ? "number" : "text"}
            step={field.type === "decimal" ? "0.0001" : field.type === "percentage" ? "0.01" : undefined}
            value={String(value ?? "")}
            onChange={(event) => setQuickMasterFields((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        )}
      </div>
    );
  };

  const definitionFields = getMasterDefinition(currentQuickMaster ?? "")?.fields ?? [];

  const getLookupOptions = (field: MasterFieldDefinition, values: Record<string, unknown>) => {
    const options = articleLookupOptions[field.lookupModuleKey ?? ""] ?? [];
    if (!field.dependsOn) return options;

    const parentField = fields.find((candidate) => candidate.key === field.dependsOn);
    const parentOptions = articleLookupOptions[parentField?.lookupModuleKey ?? ""] ?? [];
    const parentValue = String(values[field.dependsOn] ?? "");
    const parentOption = parentOptions.find((option) => option.label === parentValue);
    if (moduleKey === "article" && field.key === "Sizes" && !parentValue) return [];
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
    setValues: (values: Record<string, unknown>) => void,
    allowQuickCreate = false,
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
              <legend className="px-1 text-sm font-semibold text-slate-800">{field.label}{field.required ? " *" : ""}</legend>
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
            {allowQuickCreate && moduleKey === "article" && field.lookupModuleKey === "article-size" && (
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="secondary" onClick={() => void openQuickMaster("size", { fieldKey: field.key })}>
                  + Add New Size
                </Button>
              </div>
            )}
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
        ? (articleLookupOptions["raw-material-category"] ?? []).find((option) => option.label === String(values.Category ?? ""))
        : undefined;
      const linkedTypeValue = String(selectedCategory?.fields?.Raw_Material_Type1 ?? "");
      const linkedType = options.find((option) => [option.label, option.id, option.value_id].some((candidate) => String(candidate ?? "") === linkedTypeValue));
      const autoSelectedType = linkedType?.label;

      return (
        <div key={field.key}>
          {allowQuickCreate && moduleKey === "article" && field.type === "lookup" && (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void openQuickMaster(field.lookupModuleKey === "article-size" ? "size" : field.lookupModuleKey ?? "", { fieldKey: field.key })}
              >
                + Add New
              </Button>
            </div>
          )}
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
                const selectedCategory = (articleLookupOptions["raw-material-category"] ?? []).find((option) => option.label === nextValue);
                const categoryType = String(selectedCategory?.fields?.Raw_Material_Type1 ?? "");
                const matchingType = (articleLookupOptions["raw-material-type"] ?? []).find((option) => option.label === categoryType);
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
      const childValues = Array.isArray(value)
        ? value.map((item) => typeof item === "object" && item !== null ? item : { [childFields[0]?.key ?? "value"]: String(item ?? "") })
        : editingRecord
          ? childRecords.filter((item) => item.parentId === editingRecord.id || item.parentId === editingRecord.value_id).map((item) => ({ ...(item.fields ?? { [childFields[0]?.key ?? "value"]: item.label }), ...(item.id ? { id: item.id } : {}) }))
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
                    if (moduleKey === "article" && childField.key === "variant_code") return null;
                    const onChange = (nextValue: string) => {
                      const nextValues = [...normalizedValues];
                      nextValues[index] = { ...nextValues[index], [childField.key]: nextValue };
                      setValues({ ...values, [field.key]: nextValues });
                    };
                    if (childField.type === "lookup") {
                      return (
                        <div key={childField.key} className="space-y-1">
                          {allowQuickCreate && moduleKey === "article" && childField.lookupModuleKey && (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void openQuickMaster(childField.lookupModuleKey as string, {
                                  fieldKey: field.key,
                                  variantIndex: index,
                                  childFieldKey: childField.key,
                                })}
                              >
                                + Add New
                              </Button>
                            </div>
                          )}
                          <Select
                            label={childField.label}
                            required={childField.required}
                            value={String(childValueForField)}
                            onChange={(event) => onChange(event.target.value)}
                            options={[
                              { value: "", label: `Select ${childField.label}` },
                              ...(articleLookupOptions[childField.lookupModuleKey ?? ""] ?? []).map((option) => ({ value: option.label, label: option.label })),
                            ]}
                          />
                        </div>
                      );
                    }
                    return <Input key={childField.key} label={childField.label} required={childField.required} type={childField.type === "number" || childField.type === "percentage" || childField.type === "decimal" ? "number" : "text"} step={childField.type === "decimal" ? "0.0001" : childField.type === "percentage" ? "0.01" : undefined} value={String(childValueForField)} onChange={(event) => onChange(event.target.value)} />;
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
          step={field.type === "decimal" ? "0.0001" : field.type === "percentage" ? "0.01" : undefined}
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

  const getFieldValue = (record: MasterRecord, field: MasterFieldDefinition) => {
    const metadata =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as { fields?: Record<string, unknown> })
        : {};
    const value = metadata.fields?.[field.key];
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) {
      return value.length
        ? value.map((item) => typeof item === "object" && item !== null
          ? String((item as Record<string, unknown>).color ?? (item as Record<string, unknown>).variant ?? "Variant")
          : String(item)).join(", ")
        : "—";
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const reportFields = [
    ...(moduleKey === "article" ? [] : [{ key: "label", label: "Name" }]),
    ...(moduleKey === "article" ? [] : [{ key: "code", label: "Code" }]),
    ...fields.map((field) => ({ key: field.key, label: field.label })),
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Actions" },
  ].filter((field, index, allFields) => allFields.findIndex((item) => item.key === field.key) === index);

  const defaultVisibleReportFields = reportFields
    .filter((field) => field.key !== "description" || records.some((record) => record.description))
    .map((field) => field.key);

  const activeVisibleReportFields = visibleReportFields.length > 0
    ? visibleReportFields
    : defaultVisibleReportFields;

  const openRecordDetail = (record: MasterRecord) => {
    if (moduleKey === "article") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(record.code || record.value_id)}`);
    }
    if (moduleKey === "gold-seal") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(record.value_id)}`);
    }
  };

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
        onRecordClick={(record) => {
          if (moduleKey === "article") {
            openRecordDetail(record);
          }
        }}
        onNewOrder={() => setShowCreateModal(true)}
        newActionLabel="+ Add Record"
        renderCell={(fieldKey, record) => {
          if (fieldKey === "label" && moduleKey === "article") {
            return (
              <Link
                href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(record.code || record.value_id)}`}
                className="font-medium text-[var(--erp-brand)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
              >
                {record.label}
              </Link>
            );
          }
          if (fieldKey === "label") return record.label;
          if (fieldKey === "code") return record.code || "—";
          if (fieldKey === "description") return record.description || "—";
          if (fieldKey === "status") return record.is_active ? "Active" : "Pending";
          if (fieldKey === "actions") {
            return (
              <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
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
        }}
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
                  : renderField(field, createFields, setCreateFields, moduleKey === "article"))}
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

      {currentQuickMaster && (
        <div className="erp-popup-backdrop">
          <div className="erp-popup-panel flex max-h-[calc(100dvh-2rem)] w-[min(96vw,48rem)] max-w-none flex-col space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add New {getMasterDefinition(currentQuickMaster)?.label ?? "Master"}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={closeQuickMaster}>✕</Button>
            </div>
            {isLoadingQuickMasterOptions ? (
              <p role="status" className="text-sm text-slate-600">Loading master options...</p>
            ) : (
              <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                {definitionFields.map(renderQuickMasterField)}
              </div>
            )}
            {quickMasterError && (
              <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
                {quickMasterError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="secondary" size="sm" onClick={closeQuickMaster} disabled={isSavingQuickMaster}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={() => void saveQuickMaster()} disabled={isSavingQuickMaster || isLoadingQuickMasterOptions}>
                {isSavingQuickMaster ? "Saving..." : "Save and Select"}
              </Button>
            </div>
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
