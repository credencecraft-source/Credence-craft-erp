"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { MasterRecordsImportAction } from "@/components/master-data/master-records-excel-actions";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-registry";
import {
  clearDependentMasterFields,
  filterMasterOptionsByParent,
  getMasterSelectionLabel,
} from "@/lib/master-data/master-data-selection";
import {
  loadQuickCreateLookupOptions,
  type QuickCreateLookupOption,
} from "@/lib/master-data/quick-create-lookup-options";

type MasterLookupOption = QuickCreateLookupOption;
type MasterSelectOption = { value: string; label: string };
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

const getMasterRecordId = (record: MasterRecord) => record.id;
const ignoreReportRowClick = () => undefined;

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
  deleteSelectedAction: (formData: FormData) => Promise<void>;
  importAction: MasterRecordsImportAction;
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
const emptyMasterLookupOptions: MasterLookupOption[] = [];
const masterSelectOptionsCache = new WeakMap<object, Map<string, MasterSelectOption[]>>();

type ArticleSizePrice = { size: string; price: string | null };
type MasterFormValues = Record<string, unknown>;
type SetMasterFormValues = Dispatch<SetStateAction<MasterFormValues>>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return isStringArray(value) ? value : value.map(String);
}

function withArticleSizePrices(
  values: Record<string, unknown>,
  sizes: string[],
  sizePrices: ArticleSizePrice[],
) {
  const priceBySize = new Map(sizePrices.map(({ size, price }) => [size.toLocaleLowerCase(), price]));
  const selectedPrices = sizes.map((size) => ({
    size,
    price: priceBySize.get(size.toLocaleLowerCase()) ?? null,
  }));
  const enteredPrices = selectedPrices
    .map(({ price }) => price?.trim() ?? "")
    .filter(Boolean);
  const updatedValues: Record<string, unknown> = { ...values, Sizes: sizes, Size_Prices: selectedPrices };

  if (enteredPrices.length > 0) {
    const normalizePrice = (price: string) => {
      const [integer, fraction = ""] = price.split(".");
      const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
      const normalizedFraction = fraction.replace(/0+$/, "");
      return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
    };
    const normalizedPrices = enteredPrices.map(normalizePrice);
    const allSizesPriced = selectedPrices.length > 0 && enteredPrices.length === selectedPrices.length;
    const isUniform = allSizesPriced && normalizedPrices.every((price) => price === normalizedPrices[0]);
    updatedValues.default_price = isUniform ? enteredPrices[0] : null;
  }

  return updatedValues;
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? "Saving..." : children}
    </Button>
  );
}

function DeleteConfirmButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting..." : children}
    </Button>
  );
}

function getMasterSelectOptions(options: readonly MasterLookupOption[], placeholder?: string) {
  let byPlaceholder = masterSelectOptionsCache.get(options);
  if (!byPlaceholder) {
    byPlaceholder = new Map();
    masterSelectOptionsCache.set(options, byPlaceholder);
  }
  const cacheKey = placeholder ?? "";
  const cached = byPlaceholder.get(cacheKey);
  if (cached) return cached;

  const selectOptions = [
    ...(placeholder ? [{ value: "", label: placeholder }] : []),
    ...options.map(({ label }) => ({ value: label, label })),
  ];
  byPlaceholder.set(cacheKey, selectOptions);
  return selectOptions;
}

const MasterLookupSelect = memo(function MasterLookupSelect({
  articleLookupOptions,
  className,
  disabled,
  field,
  fields,
  moduleKey,
  name,
  options,
  setValues,
  value,
}: {
  articleLookupOptions: Record<string, MasterLookupOption[]>;
  className?: string;
  disabled: boolean;
  field: MasterFieldDefinition;
  fields: MasterFieldDefinition[];
  moduleKey: string;
  name: string;
  options: MasterSelectOption[];
  setValues: SetMasterFormValues;
  value: string;
}) {
  const handleChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setValues((current) => {
      const nextValues = clearDependentMasterFields(current, fields, field.key);
      nextValues[field.key] = nextValue;
      if (moduleKey === "article" && field.key === "Size_Group") {
        nextValues.Size_Prices = [];
      }
      if (moduleKey === "raw-material" && field.key === "Category") {
        const selectedCategory = (articleLookupOptions["raw-material-category"] ?? emptyMasterLookupOptions)
          .find((option) => option.label === nextValue);
        const categoryType = String(selectedCategory?.fields?.Raw_Material_Type1 ?? "");
        const matchingType = (articleLookupOptions["raw-material-type"] ?? emptyMasterLookupOptions)
          .find((option) => option.label === categoryType);
        nextValues.Category_Type = matchingType?.label ?? "";
      }
      return nextValues;
    });
  }, [articleLookupOptions, field.key, fields, moduleKey, setValues]);

  return (
    <Select
      label={field.label}
      required={field.required}
      name={name}
      value={value}
      disabled={disabled}
      onChange={handleChange}
      options={options}
      className={className}
    />
  );
});

const QuickMasterLookupSelect = memo(function QuickMasterLookupSelect({
  definitionFields,
  field,
  options,
  setFields,
  value,
}: {
  definitionFields: MasterFieldDefinition[];
  field: MasterFieldDefinition;
  options: MasterSelectOption[];
  setFields: Dispatch<SetStateAction<Record<string, unknown>>>;
  value: string | string[];
}) {
  const handleChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = field.multiple
      ? Array.from(event.target.selectedOptions, (option) => option.value)
      : event.target.value;
    setFields((current) => {
      const next = clearDependentMasterFields(current, definitionFields, field.key);
      next[field.key] = nextValue;
      return next;
    });
  }, [definitionFields, field.key, field.multiple, setFields]);

  return (
    <Select
      label={field.label}
      required={field.required}
      multiple={field.multiple}
      value={value}
      onChange={handleChange}
      options={options}
    />
  );
});

export function MasterRecordsTable({
  records,
  moduleLabel,
  workspaceId,
  organizationId,
  moduleKey,
  createAction,
  updateAction,
  deleteAction,
  deleteSelectedAction,
  fields,
  lookupOptions,
  childRecords = [],
}: MasterRecordsTableProps) {
  const router = useRouter();
  const [editingRecord, setEditingRecord] = useState<MasterRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{ kind: "single"; record: MasterRecord } | { kind: "selected" } | null>(null);
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
  const quickMasterOptionsRequest = useRef<AbortController | null>(null);
  const quickMasterSaveInProgress = useRef(false);

  useEffect(() => () => {
    const request = quickMasterOptionsRequest.current;
    quickMasterOptionsRequest.current = null;
    request?.abort();
  }, []);

  const orderedFields = useMemo(() => moduleKey === "raw-material"
    ? [...fields].sort((first, second) => {
      const firstOrder = rawMaterialFieldOrder.indexOf(first.key);
      const secondOrder = rawMaterialFieldOrder.indexOf(second.key);
      return (firstOrder === -1 ? rawMaterialFieldOrder.length : firstOrder)
        - (secondOrder === -1 ? rawMaterialFieldOrder.length : secondOrder);
    })
    : fields, [fields, moduleKey]);

  const openRecordDetail = useCallback((record: MasterRecord) => {
    if (moduleKey === "article") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(record.code || record.value_id)}`);
    }
    if (moduleKey === "gold-seal") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals/${encodeURIComponent(record.value_id)}`);
    }
  }, [moduleKey, organizationId, router, workspaceId]);

  const openEditor = useCallback((record: MasterRecord) => {
    if (moduleKey === "article") {
      openRecordDetail(record);
      return;
    }
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
  }, [fields, moduleKey, openRecordDetail]);

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

    quickMasterOptionsRequest.current?.abort();
    const requestController = new AbortController();
    quickMasterOptionsRequest.current = requestController;

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
      const options = await loadQuickCreateLookupOptions(
        organizationId,
        lookupKeys,
        requestController.signal,
      );
      if (quickMasterOptionsRequest.current === requestController) {
        setQuickMasterLookupOptions(options);
      }
    } catch (error) {
      if (!requestController.signal.aborted) {
        setQuickMasterError(error instanceof Error ? error.message : "Unable to load quick-create options.");
      }
    } finally {
      if (quickMasterOptionsRequest.current === requestController) {
        quickMasterOptionsRequest.current = null;
        setIsLoadingQuickMasterOptions(false);
      }
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
    if (!currentQuickMaster || quickMasterSaveInProgress.current) return;
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

    quickMasterSaveInProgress.current = true;
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
      quickMasterSaveInProgress.current = false;
      setIsSavingQuickMaster(false);
    }
  };

  const closeQuickMaster = () => {
    quickMasterOptionsRequest.current?.abort();
    quickMasterOptionsRequest.current = null;
    setIsLoadingQuickMasterOptions(false);
    setCurrentQuickMaster(null);
    setQuickMasterTarget(null);
    setQuickMasterStack([]);
    setQuickMasterError("");
  };

  const getQuickMasterOptions = (field: MasterFieldDefinition) => {
    const options = quickMasterLookupOptions[field.lookupModuleKey ?? ""] ?? emptyMasterLookupOptions;
    if (!field.dependsOn) return options;
    const parentDefinition = getMasterDefinition(currentQuickMaster ?? "");
    const parentField = parentDefinition?.fields.find((candidate) => candidate.key === field.dependsOn);
    const parentValue = String(quickMasterFields[field.dependsOn] ?? "");
    const parentOptions = quickMasterLookupOptions[parentField?.lookupModuleKey ?? ""] ?? emptyMasterLookupOptions;
    return filterMasterOptionsByParent(options, parentOptions, parentValue);
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
          <QuickMasterLookupSelect
            definitionFields={definitionFields}
            field={field}
            options={getMasterSelectOptions(options, field.multiple ? undefined : `Select ${field.label}`)}
            setFields={setQuickMasterFields}
            value={field.multiple ? getStringArray(value) : String(value ?? "")}
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
    const options = articleLookupOptions[field.lookupModuleKey ?? ""] ?? emptyMasterLookupOptions;
    if (!field.dependsOn) return options;

    const parentField = fields.find((candidate) => candidate.key === field.dependsOn);
    const parentOptions = articleLookupOptions[parentField?.lookupModuleKey ?? ""] ?? emptyMasterLookupOptions;
    const parentValue = values[field.dependsOn];
    if (moduleKey === "article" && field.key === "Sizes" && !parentValue) return [];
    return filterMasterOptionsByParent(options, parentOptions, parentValue);
  };

  const renderField = (
    field: MasterFieldDefinition,
    values: MasterFormValues,
    setValues: SetMasterFormValues,
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
              const checked = event.target.checked;
              setValues((current) => ({ ...current, [field.key]: checked }));
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
              const nextValue = event.target.value;
              setValues((current) => ({ ...current, [field.key]: nextValue }));
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
        const rawSelectedValues = Array.isArray(selectedValue)
          ? selectedValue.map(String)
          : selectedValue
            ? [String(selectedValue)]
            : [];
        const selectedValues = rawSelectedValues.map((selected) => getMasterSelectionLabel(options, selected));

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
                  onClick={() => setValues((current) => ({
                    ...current,
                    [field.key]: [...(Array.isArray(current[field.key]) ? current[field.key] as string[] : sizeRows), ""],
                  }))}
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
                          const selectedSize = event.target.value;
                          setValues((current) => {
                            const currentRows = Array.isArray(current[field.key]) ? current[field.key] as string[] : sizeRows;
                            const nextValues = [...currentRows];
                            nextValues[index] = selectedSize;
                            return { ...current, [field.key]: nextValues };
                          });
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
                          setValues((current) => {
                            const currentRows = Array.isArray(current[field.key]) ? current[field.key] as string[] : sizeRows;
                            const nextValues = currentRows.filter((_, rowIndex) => rowIndex !== index);
                            return { ...current, [field.key]: nextValues.length > 0 ? nextValues : [""] };
                          });
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
                        const isChecked = event.target.checked;
                        setValues((current) => {
                          const currentRawValues = Array.isArray(current[field.key])
                            ? (current[field.key] as unknown[]).map(String)
                            : [];
                          const currentSelectedValues = currentRawValues.map((selected) => getMasterSelectionLabel(options, selected));
                          const nextValue = isChecked
                            ? [...new Set([...currentSelectedValues, option.label])]
                            : currentSelectedValues.filter((item) => item !== option.label);
                          const nextValues = moduleKey === "article" && field.key === "Sizes"
                            ? withArticleSizePrices(
                                current,
                                nextValue,
                                Array.isArray(current.Size_Prices)
                                  ? current.Size_Prices.filter((item): item is ArticleSizePrice =>
                                      typeof item === "object" && item !== null
                                      && "size" in item && typeof item.size === "string"
                                      && "price" in item && (typeof item.price === "string" || item.price === null))
                                  : [],
                              )
                            : { ...current, [field.key]: nextValue };
                          const resetValues = clearDependentMasterFields(nextValues, fields, field.key);
                          resetValues[field.key] = nextValue;
                          return resetValues;
                        });
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </div>
                );
              })}
            </div>
            {moduleKey === "article" && field.key === "Sizes" && selectedValues.length > 0 && (
              <div className="space-y-3 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-700">Price by size</p>
                {selectedValues.map((size) => {
                  const sizePrices = Array.isArray(values.Size_Prices)
                    ? values.Size_Prices.filter((item): item is ArticleSizePrice =>
                        typeof item === "object" && item !== null
                        && "size" in item && typeof item.size === "string"
                        && "price" in item && (typeof item.price === "string" || item.price === null))
                    : [];
                  const price = sizePrices.find((item) => item.size.toLocaleLowerCase() === size.toLocaleLowerCase())?.price ?? "";
                  return (
                    <Input
                      key={`size-price-${size}`}
                      label={`Price for size ${size}`}
                      type="number"
                      min="0"
                      step="0.0001"
                      textCase="preserve"
                      value={price}
                      onChange={(event) => {
                        const nextPrice = event.target.value || null;
                        setValues((current) => {
                          const currentPrices = Array.isArray(current.Size_Prices)
                            ? current.Size_Prices.filter((item): item is ArticleSizePrice =>
                                typeof item === "object" && item !== null
                                && "size" in item && typeof item.size === "string"
                                && "price" in item && (typeof item.price === "string" || item.price === null))
                            : [];
                          const nextPrices = currentPrices.filter((item) => item.size.toLocaleLowerCase() !== size.toLocaleLowerCase());
                          nextPrices.push({ size, price: nextPrice });
                          return withArticleSizePrices(current, selectedValues, nextPrices);
                        });
                      }}
                    />
                  );
                })}
                <input
                  type="hidden"
                  name="articleSizePrices"
                  value={JSON.stringify(Array.isArray(values.Size_Prices) ? values.Size_Prices : [])}
                />
              </div>
            )}
            {options.length === 0 && <p className="text-xs text-slate-500">No {field.label.toLowerCase()} options available.</p>}
            {field.required && <p className="text-[11px] text-slate-500">Select at least one.</p>}
          </fieldset>
        );
      }
      const selectedCategory = moduleKey === "raw-material" && field.key === "Category_Type"
        ? (articleLookupOptions["raw-material-category"] ?? emptyMasterLookupOptions).find((option) => option.label === String(values.Category ?? ""))
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
          <MasterLookupSelect
            articleLookupOptions={articleLookupOptions}
            className="rounded-lg p-2 text-sm"
            disabled={field.readOnly || Boolean(autoSelectedType)}
            field={field}
            fields={fields}
            moduleKey={moduleKey}
            name={`field_${field.key}`}
            options={getMasterSelectOptions(options, `Select ${field.label}`)}
            setValues={setValues}
            value={autoSelectedType ?? getMasterSelectionLabel(options, selectedValue)}
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
        <div key={field.key} className={`col-span-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 ${moduleKey === "article" ? "space-y-2 p-3" : "space-y-3 p-4"}`}>
          <div className={`flex min-w-0 items-center justify-between gap-3 border-b border-slate-200 ${moduleKey === "article" ? "pb-2" : "pb-3"}`}>
              <div className="min-w-0">
                <span className={moduleKey === "article" ? "text-xs font-bold uppercase tracking-wide text-slate-700" : "text-sm font-semibold text-slate-800"}>{moduleKey === "article" ? "Color variants" : field.label}</span>
                {moduleKey === "article" ? <p className="mt-0.5 text-xs text-slate-500">Add a color, SKU, and optional price override for each variant.</p> : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => setValues((current) => ({
                  ...current,
                  [field.key]: [
                    ...(Array.isArray(current[field.key]) ? current[field.key] as Array<Record<string, unknown>> : normalizedValues),
                    {},
                  ],
                }))}
              >
                {moduleKey === "article" ? "Add color" : "Add row"}
              </Button>
          </div>
          <input type="hidden" name={`field_${field.key}`} value={JSON.stringify(normalizedValues.filter((row) => Object.values(row).some((item) => String(item ?? "").trim() !== "")))} />
          <div className="space-y-2">
              {normalizedValues.map((childValue, index) => (
                <div key={`${field.key}-${index}`} className={`grid min-w-0 rounded-lg border border-slate-200 bg-white sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] ${moduleKey === "article" ? "items-center gap-2 p-2" : "items-end gap-3 p-3"}`}>
                  <span className={`flex items-center justify-center text-sm font-semibold tabular-nums text-slate-500 ${moduleKey === "article" ? "h-8 self-center" : "h-10 self-end"}`}>{index + 1}</span>
                  <div className={`grid min-w-0 ${moduleKey === "article" ? "gap-2 sm:grid-cols-2 xl:grid-cols-3" : "gap-3 sm:grid-cols-2"}`}>
                    {childFields.map((childField) => {
                    const childValueForField = childValue[childField.key] ?? "";
                    if (moduleKey === "article" && childField.key === "variant_code") return null;
                    const onChange = (nextValue: string) => {
                      setValues((current) => {
                        const currentRows = Array.isArray(current[field.key])
                          ? current[field.key] as Array<Record<string, unknown>>
                          : normalizedValues;
                        const nextValues = [...currentRows];
                        nextValues[index] = { ...nextValues[index], [childField.key]: nextValue };
                        return { ...current, [field.key]: nextValues };
                      });
                    };
                    if (childField.type === "lookup") {
                      return (
                        <div key={childField.key} className={allowQuickCreate && moduleKey === "article" && childField.lookupModuleKey ? "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2" : "min-w-0"}>
                          <Select
                            label={childField.label}
                            required={childField.required}
                            value={getMasterSelectionLabel(
                              articleLookupOptions[childField.lookupModuleKey ?? ""] ?? [],
                              childValueForField,
                            )}
                            onChange={(event) => onChange(event.target.value)}
                            options={[
                              { value: "", label: `Select ${childField.label}` },
                              ...(articleLookupOptions[childField.lookupModuleKey ?? ""] ?? []).map((option) => ({ value: option.label, label: option.label })),
                            ]}
                            className={moduleKey === "article" ? "h-9 px-2 py-1.5 text-sm" : undefined}
                          />
                          {allowQuickCreate && moduleKey === "article" && childField.lookupModuleKey && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="mb-0.5 shrink-0 px-2"
                              onClick={() => void openQuickMaster(childField.lookupModuleKey as string, {
                                fieldKey: field.key,
                                variantIndex: index,
                                childFieldKey: childField.key,
                              })}
                            >
                              + Add
                            </Button>
                          )}
                        </div>
                      );
                    }
                    return <Input key={childField.key} label={childField.label} required={childField.required} type={childField.type === "number" || childField.type === "percentage" || childField.type === "decimal" ? "number" : "text"} step={childField.type === "decimal" ? "0.0001" : childField.type === "percentage" ? "0.01" : undefined} value={String(childValueForField)} onChange={(event) => onChange(event.target.value)} className={moduleKey === "article" ? "h-9 px-2 py-1.5 text-sm" : undefined} />;
                  })}
                </div>
                <Button
                  type="button"
                  variant={moduleKey === "article" ? "destructive" : "ghost"}
                  size="sm"
                  onClick={() => {
                    if (moduleKey !== "article" || window.confirm("Remove this article color variant?")) {
                      setValues((current) => {
                        const currentRows = Array.isArray(current[field.key])
                          ? current[field.key] as Array<Record<string, unknown>>
                          : normalizedValues;
                        return { ...current, [field.key]: currentRows.filter((_, itemIndex) => itemIndex !== index) };
                      });
                    }
                  }}
                  className={`justify-self-end sm:mb-0.5 ${moduleKey === "article" ? "" : "text-red-600"}`}
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
            const nextValue = event.target.value;
            setValues((current) => ({ ...current, [field.key]: nextValue }));
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
    if (Array.isArray(value)) {
      return value.length
        ? value.map((item) => typeof item === "object" && item !== null
          ? String((item as Record<string, unknown>).color ?? (item as Record<string, unknown>).variant ?? "Variant")
          : String(item)).join(", ")
        : "—";
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }, []);

  const reportFields = useMemo(() => [
    ...(moduleKey === "article" ? [] : [{ key: "label", label: "Name" }]),
    ...(moduleKey === "article" ? [] : [{ key: "code", label: "Code" }]),
    ...fields.map((field) => ({ key: field.key, label: field.label })),
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Actions" },
  ].filter((field, index, allFields) => allFields.findIndex((item) => item.key === field.key) === index), [fields, moduleKey]);

  const defaultVisibleReportFields = useMemo(() => reportFields
    .filter((field) => field.key !== "description" || records.some((record) => record.description))
    .map((field) => field.key), [records, reportFields]);

  const activeVisibleReportFields = useMemo(() => visibleReportFields.length > 0
    ? visibleReportFields
    : defaultVisibleReportFields, [defaultVisibleReportFields, visibleReportFields]);

  const masterFieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const handleToggleSelectAll = useCallback((checked: boolean, ids: string[]) => {
    setSelectedRecordIds((current) =>
      checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
    );
  }, []);
  const handleToggleRowSelection = useCallback((id: string, checked: boolean) => {
    setSelectedRecordIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((selectedId) => selectedId !== id),
    );
  }, []);
  const handleBulkDeleteSelected = useCallback(() => setDeleteDialog({ kind: "selected" }), []);
  const handleRecordClick = useCallback((record: MasterRecord) => {
    if (moduleKey === "article") openRecordDetail(record);
  }, [moduleKey, openRecordDetail]);
  const handleNewOrder = useCallback(() => {
    if (moduleKey === "article") {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/create`);
    } else {
      setShowCreateModal(true);
    }
  }, [moduleKey, organizationId, router, workspaceId]);
  const renderReportCell = useCallback((fieldKey: string, record: MasterRecord): ReactNode => {
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
          <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteDialog({ kind: "single", record })}>
            Delete
          </Button>
        </div>
      );
    }
    const field = masterFieldByKey.get(fieldKey);
    return field ? getFieldValue(record, field) : "—";
  }, [getFieldValue, masterFieldByKey, moduleKey, openEditor, openRecordDetail, organizationId, workspaceId]);

  return (
    <div className="space-y-4">
      <ReportGrid
        title={`${moduleLabel} Report`}
        records={records}
        fields={reportFields}
        visibleFields={activeVisibleReportFields}
        onVisibleFieldsChange={setVisibleReportFields}
        storageKey={`master-report-columns-${moduleKey}`}
        rowIdSelector={getMasterRecordId}
        selectedIds={selectedRecordIds}
        selectable
        onToggleSelectAll={handleToggleSelectAll}
        onToggleRowSelection={handleToggleRowSelection}
        onBulkDeleteSelected={handleBulkDeleteSelected}
        bulkDeleteSelectedLabel={`Delete selected ${moduleLabel} records`}
        onRowClick={ignoreReportRowClick}
        onRecordClick={handleRecordClick}
        onNewOrder={handleNewOrder}
        newActionLabel="+ Add Record"
        renderCell={renderReportCell}
        emptyMessage={`No ${moduleLabel.toLowerCase()} records found.`}
      />

      <Modal
        open={deleteDialog !== null}
        onClose={() => setDeleteDialog(null)}
        ariaLabelledBy="master-delete-confirmation-title"
        ariaDescribedBy="master-delete-confirmation-description"
        variant="danger"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="master-delete-confirmation-title" className="text-lg font-semibold text-[var(--erp-text)]">
              {deleteDialog?.kind === "selected"
                ? `Delete ${selectedRecordIds.length} selected ${moduleLabel} records?`
                : `Delete this ${moduleLabel.toLowerCase()} record?`}
            </h2>
            <p id="master-delete-confirmation-description" className="mt-2 text-sm text-[var(--erp-muted)]">
              This cannot be undone. Records referenced by other data, or protected demo records, cannot be deleted.
              {deleteDialog?.kind === "selected" ? " The selected batch is all-or-nothing." : ""}
            </p>
          </div>
          {deleteDialog?.kind === "single" ? (
            <form action={deleteAction} className="flex justify-end gap-2">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              <input type="hidden" name="valueId" value={deleteDialog.record.value_id} />
              <Button type="button" variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
              <DeleteConfirmButton>Delete record</DeleteConfirmButton>
            </form>
          ) : deleteDialog?.kind === "selected" ? (
            <form action={deleteSelectedAction} className="flex justify-end gap-2">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />
              {selectedRecordIds.map((id) => <input key={id} type="hidden" name="recordId" value={id} />)}
              <Button type="button" variant="secondary" onClick={() => setDeleteDialog(null)}>Cancel</Button>
              <DeleteConfirmButton>Delete {selectedRecordIds.length} records</DeleteConfirmButton>
            </form>
          ) : null}
        </div>
      </Modal>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="erp-popup-backdrop">
          <div className={`erp-popup-panel flex h-[calc(100dvh-1.5rem)] max-h-[56rem] ${moduleKey === "raw-material" ? "w-[min(96vw,72rem)]" : moduleKey === "article" ? "w-[min(96vw,82rem)]" : "w-[min(96vw,90rem)]"} max-w-none flex-col space-y-4 p-5`}>
            <div className={`flex min-w-0 justify-between gap-4 border-b pb-3 ${moduleKey === "article" ? "items-start border-slate-200" : "items-center border-slate-100"}`}>
              <div className="min-w-0">
                {moduleKey === "article" ? <p className="erp-eyebrow">Article master</p> : null}
                <h3 className={moduleKey === "article" ? "mt-1 text-lg font-semibold text-slate-900" : "text-sm font-bold text-slate-900"}>Add New {moduleLabel}</h3>
                {moduleKey === "article" ? <p className="mt-1 text-sm text-slate-500">Enter article details and configure its color variants.</p> : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Close add ${moduleLabel} form`}
                onClick={closeCreateModal}
              >
                ✕
              </Button>
            </div>
            <form action={createAction} className="flex min-h-0 flex-1 flex-col space-y-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="moduleKey" value={moduleKey} />

              <div className={`grid min-h-0 flex-1 grid-cols-1 content-start gap-x-6 gap-y-4 overflow-y-auto pr-2 ${moduleKey === "raw-material" ? "sm:grid-cols-2" : moduleKey === "article" ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
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
