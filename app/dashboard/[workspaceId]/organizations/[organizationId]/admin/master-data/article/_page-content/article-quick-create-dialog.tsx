"use client";

import { useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { getMasterDefinition, type MasterFieldDefinition } from "@/lib/master-data/master-data-registry";
import {
  loadQuickCreateLookupOptions,
  mergeQuickCreateLookupOptions,
  type QuickCreateLookupOption,
} from "@/lib/master-data/quick-create-lookup-options";

type ArticleQuickCreateDialogProps = {
  organizationId: string;
  masterKey: string;
  initialFields: Record<string, unknown>;
  onClose: () => void;
  onCreated: (option: QuickCreateLookupOption) => void;
};
type QuickCreateSnapshot = {
  masterKey: string;
  values: Record<string, unknown>;
  lookupOptions: Record<string, QuickCreateLookupOption[]>;
  returnFieldKey: string;
};

function initialValue(field: MasterFieldDefinition) {
  return field.type === "checkbox" ? false : field.multiple ? [] : "";
}

export default function ArticleQuickCreateDialog({
  organizationId,
  masterKey,
  initialFields,
  onClose,
  onCreated,
}: ArticleQuickCreateDialogProps) {
  const [currentMasterKey, setCurrentMasterKey] = useState(masterKey);
  const definition = getMasterDefinition(currentMasterKey);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries((getMasterDefinition(masterKey)?.fields ?? []).map((field) => [field.key, initialValue(field)])),
    ...initialFields,
  }));
  const [lookupOptions, setLookupOptions] = useState<Record<string, QuickCreateLookupOption[]>>({});
  const [stack, setStack] = useState<QuickCreateSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    const lookupKeys = [...new Set((definition?.fields ?? [])
      .filter((field) => field.type === "lookup" && field.lookupModuleKey)
      .map((field) => field.lookupModuleKey as string))];

    void loadQuickCreateLookupOptions(organizationId, lookupKeys, controller.signal)
      .then((loadedOptions) => setLookupOptions((current) =>
        mergeQuickCreateLookupOptions(current, loadedOptions)))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load quick-create options.");
        }
      })
      .finally(() => {
        if (requestController.current === controller) {
          requestController.current = null;
          setIsLoading(false);
        }
      });

    return () => {
      requestController.current = null;
      controller.abort();
    };
  }, [currentMasterKey, definition, organizationId]);

  const setValue = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const openNestedQuickCreate = (field: MasterFieldDefinition) => {
    if (!field.lookupModuleKey) return;
    const nestedDefinition = getMasterDefinition(field.lookupModuleKey);
    if (!nestedDefinition) {
      setError(`The ${field.lookupModuleKey} master is not configured for quick creation.`);
      return;
    }
    setStack((current) => [...current, {
      masterKey: currentMasterKey,
      values,
      lookupOptions,
      returnFieldKey: field.key,
    }]);
    setCurrentMasterKey(field.lookupModuleKey);
    setValues(Object.fromEntries(nestedDefinition.fields.map((nestedField) => [
      nestedField.key,
      initialValue(nestedField),
    ])));
    setLookupOptions({});
    setError("");
    setIsLoading(true);
  };

  const save = async () => {
    if (!definition || isSavingRef.current) return;
    const missingField = definition.fields.find((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return Array.isArray(value) ? value.length === 0 : String(value ?? "").trim() === "";
    });
    if (missingField) {
      setError(`${missingField.label} is required.`);
      return;
    }

    const labelKey = definition.labelField ?? definition.fields[0]?.key;
    const label = labelKey ? String(values[labelKey] ?? "").trim() : "";
    if (!label) {
      setError(`Enter ${definition.label.toLowerCase()} name.`);
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(currentMasterKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, fields: values }),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to create master value.");
      }
      if (typeof result !== "object" || result === null || !("id" in result)) {
        throw new Error("The new master was created, but its selection could not be returned.");
      }

      const parentField = definition.fields.find((field) => field.type === "lookup" && field.lookupModuleKey);
      const parentValue = parentField ? String(values[parentField.key] ?? "") : "";
      const parentOption = parentField
        ? lookupOptions[parentField.lookupModuleKey ?? ""]?.find((option) =>
            [option.id, option.value_id, option.label].some((candidate) => String(candidate ?? "") === parentValue))
        : undefined;
      const selectedSizes = Array.isArray(values.Size) ? values.Size.map(String) : [];
      const createdOption: QuickCreateLookupOption = {
        id: String(result.id),
        value_id: "value_id" in result ? String(result.value_id) : String(result.id),
        label,
        parent_id: parentOption?.id ?? null,
        fields: values,
        ...(selectedSizes.length > 0
          ? { sizes: selectedSizes.map((size) => ({ id: size, value_id: size, label: size, parent_id: String(result.id) })) }
          : {}),
      };
      const parent = stack.at(-1);
      if (parent) {
        const parentDefinition = getMasterDefinition(parent.masterKey);
        const parentField = parentDefinition?.fields.find((field) => field.key === parent.returnFieldKey);
        if (!parentField) {
          throw new Error("Unable to return the new lookup to its parent form.");
        }
        const lookupKey = parentField.lookupModuleKey ?? "";
        setStack((current) => current.slice(0, -1));
        setCurrentMasterKey(parent.masterKey);
        setValues({ ...parent.values, [parent.returnFieldKey]: parentField.multiple
          ? [...new Set([
              ...(Array.isArray(parent.values[parent.returnFieldKey])
                ? (parent.values[parent.returnFieldKey] as unknown[]).map(String)
                : []),
              label,
            ])]
          : label });
        setLookupOptions({
          ...parent.lookupOptions,
          [lookupKey]: [
            ...(parent.lookupOptions[lookupKey] ?? []).filter((option) => option.label !== label),
            createdOption,
          ],
        });
        return;
      }
      onCreated(createdOption);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create master value.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const renderField = (field: MasterFieldDefinition) => {
    if (field.readOnly || field.type === "child-list" || field.type === "image") return null;
    const value = values[field.key] ?? initialValue(field);

    if (field.type === "lookup") {
      return (
        <div key={field.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Select
            label={field.label}
            required={field.required}
            multiple={field.multiple}
            value={field.multiple
              ? (Array.isArray(value) ? value.map(String) : [])
              : String(value ?? "")}
            onChange={(event) => setValue(field.key, field.multiple
              ? Array.from(event.target.selectedOptions, (option) => option.value)
              : event.target.value)}
            options={[
              ...(!field.multiple ? [{ value: "", label: `Select ${field.label}` }] : []),
              ...(lookupOptions[field.lookupModuleKey ?? ""] ?? []).map((option) => ({
                value: option.label,
                label: option.label,
              })),
            ]}
          />
          {field.lookupModuleKey && getMasterDefinition(field.lookupModuleKey) ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => openNestedQuickCreate(field)}>
              + Add New
            </Button>
          ) : null}
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <Checkbox
          key={field.key}
          label={field.label}
          checked={value === true}
          onChange={(event) => setValue(field.key, event.target.checked)}
        />
      );
    }

    if (field.type === "picklist") {
      return (
        <Select
          key={field.key}
          label={field.label}
          required={field.required}
          value={String(value ?? "")}
          onChange={(event) => setValue(field.key, event.target.value)}
          options={[
            { value: "", label: `Select ${field.label}` },
            ...(field.options ?? []).map((option) => ({ value: option, label: option })),
          ]}
        />
      );
    }

    return (
      <Input
        key={field.key}
        label={field.label}
        required={field.required}
        type={field.type === "date" ? "date" : ["number", "percentage", "decimal"].includes(field.type) ? "number" : "text"}
        step={field.type === "decimal" ? "0.0001" : field.type === "percentage" ? "0.01" : undefined}
        value={String(value ?? "")}
        onChange={(event) => setValue(field.key, event.target.value)}
      />
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={`Quick-create ${definition?.label ?? "master"}`}
      size="lg"
      closeOnBackdrop={stack.length === 0}
    >
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">Add New {definition?.label ?? "Master"}</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">Create and select this lookup value.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const parent = stack.at(-1);
              if (!parent) {
                onClose();
                return;
              }
              setStack((current) => current.slice(0, -1));
              setCurrentMasterKey(parent.masterKey);
              setValues(parent.values);
              setLookupOptions(parent.lookupOptions);
              setIsLoading(false);
              setError("");
            }}
            disabled={isSaving}
            aria-label={stack.length > 0 ? "Back to parent quick-create" : "Close quick-create dialog"}
          >
            {stack.length > 0 ? "Back" : "Close"}
          </Button>
        </div>

        {isLoading ? (
          <p role="status" aria-live="polite" className="text-sm text-[var(--erp-muted)]">Loading master options...</p>
        ) : (
          <div className="grid max-h-[60dvh] min-w-0 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
            {definition?.fields.map(renderField)}
          </div>
        )}
        {error ? <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-[var(--erp-border)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button type="button" variant="primary" onClick={() => void save()} disabled={isLoading || isSaving}>
            {isSaving ? "Saving..." : "Save and Select"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
