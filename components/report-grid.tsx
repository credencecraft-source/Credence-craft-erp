"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ReportFieldDefinition = {
  key: string;
  label: string;
};

export type ReportGridProps<T extends Record<string, unknown>> = {
  title?: string;
  records: T[];
  fields: ReportFieldDefinition[];
  visibleFields: string[];
  onVisibleFieldsChange: (value: string[]) => void;
  storageKey: string;
  rowIdSelector: (row: T) => string;
  selectedRowId?: string | null;
  selectedIds?: string[];
  onRowClick: (rowId: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
  onToggleRowSelection?: (rowId: string, checked: boolean) => void;
  emptyMessage?: string;
  renderCell: (fieldKey: string, row: T) => React.ReactNode;
  statusOptions?: readonly string[];
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  onNewOrder?: () => void;
};

type FilterOperator = "is" | "contains" | "notContains" | "empty";
type ColumnFilter = {
  operator: FilterOperator;
  value: string;
};

const DEFAULT_FILTERS: Partial<Record<string, ColumnFilter>> = {};

function getSavedSettings(key: string): Partial<{ visibleFields: string[]; filters: Partial<Record<string, ColumnFilter>> }> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<{ visibleFields: string[]; filters: Partial<Record<string, ColumnFilter>> }>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function ReportGrid<T extends Record<string, unknown>>({
  title = "Report View",
  records,
  fields,
  visibleFields,
  onVisibleFieldsChange,
  storageKey,
  rowIdSelector,
  selectedRowId,
  selectedIds = [],
  onRowClick,
  onToggleSelectAll,
  onToggleRowSelection,
  emptyMessage = "No matching records for the applied filters.",
  renderCell,
  statusOptions,
  selectedStatus,
  onStatusChange,
  onNewOrder,
}: ReportGridProps<T>) {
  const savedSettings = useMemo(() => getSavedSettings(storageKey), [storageKey]);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<string, ColumnFilter>>>(() => savedSettings.filters ?? DEFAULT_FILTERS);
  const [activeFilterField, setActiveFilterField] = useState<{ field: string; label: string } | null>(null);
  const [activeFilterOperator, setActiveFilterOperator] = useState<FilterOperator>("contains");
  const [activeFilterValue, setActiveFilterValue] = useState("");
  const [showFieldConfiguration, setShowFieldConfiguration] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const filterValueInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedVisibleFields = useMemo(() => {
    const fallback = fields.map((field) => field.key);
    const saved = savedSettings.visibleFields ?? visibleFields;
    const source = saved.length ? saved : fallback;
    const sanitized = source.filter((fieldKey) => fields.some((field) => field.key === fieldKey));
    return sanitized.length ? sanitized : fallback;
  }, [fields, savedSettings.visibleFields, visibleFields]);

  const visibleFieldDefinitions = useMemo(
    () => fields.filter((field) => normalizedVisibleFields.includes(field.key)),
    [fields, normalizedVisibleFields],
  );

  const filteredRecords = useMemo(() => {
    const activeFilters = Object.entries(columnFilters) as Array<[string, ColumnFilter | undefined]>;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (activeFilters.length === 0 && !normalizedSearch) return records;

    return records.filter((record) => {
      const matchesSearch = !normalizedSearch || fields.some((field) => String(record[field.key] ?? "").toLowerCase().includes(normalizedSearch));
      return matchesSearch && activeFilters.every(([fieldKey, filter]) => {
        if (!filter) return true;
        const rawValue = (() => {
          const value = (record as Record<string, unknown>)[fieldKey];
          if (value === null || value === undefined) return "";
          if (typeof value === "number") return String(value);
          if (typeof value === "string") return value;
          return String(value);
        })();

        const normalizedValue = rawValue.trim().toLowerCase();
        const normalizedFilterValue = filter.value.trim().toLowerCase();

        if (filter.operator === "empty") return normalizedValue.length === 0;
        if (filter.operator === "is") return normalizedValue === normalizedFilterValue;
        if (filter.operator === "notContains") return normalizedFilterValue.length === 0 ? true : !normalizedValue.includes(normalizedFilterValue);
        return normalizedFilterValue.length === 0 ? true : normalizedValue.includes(normalizedFilterValue);
      });
    });
  }, [columnFilters, fields, records, searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        visibleFields: normalizedVisibleFields,
        filters: columnFilters,
      }),
    );
  }, [columnFilters, normalizedVisibleFields, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!visibleFields || visibleFields.length === 0) {
      onVisibleFieldsChange(fields.map((field) => field.key));
    }
  }, [fields, onVisibleFieldsChange, visibleFields]);

  useEffect(() => {
    if (!activeFilterField || activeFilterOperator === "empty") return;
    const timer = window.setTimeout(() => {
      filterValueInputRef.current?.focus();
      filterValueInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeFilterField, activeFilterOperator]);

  const openFilterForField = (fieldKey: string, label: string) => {
    if (activeFilterField?.field === fieldKey) {
      setActiveFilterField(null);
      return;
    }

    const existing = columnFilters[fieldKey];
    setActiveFilterField({ field: fieldKey, label });
    setActiveFilterOperator(existing?.operator ?? "contains");
    setActiveFilterValue(existing?.value ?? "");
  };

  const clearActiveFilter = () => {
    if (!activeFilterField) return;
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[activeFilterField.field];
      return next;
    });
    setActiveFilterField(null);
    setActiveFilterOperator("contains");
    setActiveFilterValue("");
  };

  const applyActiveFilter = () => {
    if (!activeFilterField) return;
    if (activeFilterOperator !== "empty" && activeFilterValue.trim().length === 0) return;

    setColumnFilters((current) => ({
      ...current,
      [activeFilterField.field]: {
        operator: activeFilterOperator,
        value: activeFilterOperator === "empty" ? "" : activeFilterValue.trim(),
      },
    }));
    setActiveFilterField(null);
  };

  const removeFilterForField = (fieldKey: string) => {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });

    if (activeFilterField?.field === fieldKey) {
      setActiveFilterField(null);
    }
  };

  const getFilterLabel = (filter: ColumnFilter) => {
    if (filter.operator === "empty") return "Empty";
    if (filter.operator === "is") return `Is: ${filter.value}`;
    if (filter.operator === "notContains") return `Not Contain: ${filter.value}`;
    return `Contains: ${filter.value}`;
  };

  const handleToggleVisibleField = (fieldKey: string) => {
    const next = normalizedVisibleFields.includes(fieldKey)
      ? normalizedVisibleFields.filter((value) => value !== fieldKey)
      : [...normalizedVisibleFields, fieldKey];

    if (next.length === 0) return;

    setColumnFilters((current) => {
      const nextFilters = { ...current };
      delete nextFilters[fieldKey];
      return nextFilters;
    });
    onVisibleFieldsChange(next);
  };

  const allFilteredSelected = useMemo(
    () => filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.includes(rowIdSelector(record))),
    [filteredRecords, rowIdSelector, selectedIds],
  );

  const renderFilterHeader = (fieldKey: string, label: string, isLast?: boolean) => (
    <th key={fieldKey} className={`relative ${isLast ? "border-b border-slate-200" : "border-b border-r border-slate-200"} px-3 py-3`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => openFilterForField(fieldKey, label)} className="transition hover:text-emerald-700">
          {label}
        </button>
        {columnFilters[fieldKey] ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-red-700">
            <span>{getFilterLabel(columnFilters[fieldKey] as ColumnFilter)}</span>
            <button
              type="button"
              aria-label={`Remove ${label} filter`}
              onClick={(event) => {
                event.stopPropagation();
                removeFilterForField(fieldKey);
              }}
              className="leading-none text-red-700 transition hover:text-red-900"
            >
              ×
            </button>
          </span>
        ) : null}
      </div>

      {activeFilterField?.field === fieldKey ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl normal-case">
          <p className="text-xs font-semibold text-slate-800">{activeFilterField.label} filter</p>
          <div className="mt-3 space-y-3">
            <label className="block text-[11px] font-medium text-slate-600">
              Match type
              <select
                value={activeFilterOperator}
                onChange={(event) => setActiveFilterOperator(event.target.value as FilterOperator)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-300"
              >
                <option value="is">Is</option>
                <option value="contains">Contains</option>
                <option value="notContains">Not Contain</option>
                <option value="empty">Empty</option>
              </select>
            </label>
            {activeFilterOperator !== "empty" ? (
              <label className="block text-[11px] font-medium text-slate-600">
                Value
                <input
                  ref={filterValueInputRef}
                  value={activeFilterValue}
                  onChange={(event) => setActiveFilterValue(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-300"
                  placeholder="Enter value"
                />
              </label>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={clearActiveFilter} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
              Clear
            </button>
            <button
              type="button"
              onClick={applyActiveFilter}
              disabled={activeFilterOperator !== "empty" && activeFilterValue.trim().length === 0}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </th>
  );

  return (
    <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_12px_35px_rgba(20,83,45,0.06)]">
      {statusOptions && statusOptions.length > 0 ? (
        <div className="border-b border-emerald-100 bg-emerald-50/60 p-2">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatusChange?.(status)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  selectedStatus === status
                    ? "border-emerald-300 bg-emerald-700 text-white shadow-sm"
                    : "border-emerald-100 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-b border-emerald-100 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              {filteredRecords.length} records
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="relative min-w-[210px] flex-1 sm:flex-none">
              <span className="sr-only">Search report</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search records"
                className="w-full rounded-xl border border-emerald-100 bg-emerald-50/40 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white"
              />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-emerald-700 stroke-[1.8]" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.5 4.5" />
              </svg>
            </label>
            <button
              type="button"
              onClick={() => setShowFieldConfiguration(true)}
              className="rounded-xl border border-emerald-100 bg-white p-2 text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50"
              aria-label="Field configuration"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {onNewOrder ? (
              <button
                type="button"
                onClick={onNewOrder}
                className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-800"
              >
                + New Order
              </button>
            ) : null}
            <span className="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-700">Filter columns</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-[1200px] w-full border-separate border-spacing-0 text-left text-[12.5px] text-slate-700">
          <thead className="bg-emerald-50/70 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="border-b border-r border-slate-200 px-3 py-3 text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    onToggleSelectAll?.(event.target.checked);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label="Select all"
                />
              </th>
              {visibleFieldDefinitions.map((field, index) => renderFilterHeader(field.key, field.label, index === visibleFieldDefinitions.length - 1))}
            </tr>
          </thead>

          <tbody>
            {filteredRecords.length === 0 ? (
              <tr className="bg-white">
                <td colSpan={visibleFieldDefinitions.length + 1} className="border-b border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredRecords.map((record, index) => {
                const recordId = rowIdSelector(record);
                return (
                  <tr
                    key={recordId}
                    onClick={() => onRowClick(recordId)}
                    className={`cursor-pointer transition ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"} ${selectedRowId === recordId ? "bg-emerald-50" : "hover:bg-slate-100/80"}`}
                  >
                    <td className="border-b border-r border-slate-200 px-3 py-3 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(recordId)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          onToggleRowSelection?.(recordId, event.target.checked);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select ${recordId}`}
                      />
                    </td>
                    {visibleFieldDefinitions.map((field, fieldIndex) => (
                      <td
                        key={`${recordId}-${field.key}`}
                        className={`border-b ${fieldIndex === visibleFieldDefinitions.length - 1 ? "border-slate-200" : "border-r border-slate-200"} px-3 py-3 text-slate-700`}
                      >
                        {renderCell(field.key, record)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showFieldConfiguration ? (
        <div className="fixed inset-0 z-[120] bg-slate-950/45 p-4 sm:p-8 backdrop-blur-sm">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/50 px-4 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700">Fields</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Visible report columns</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFieldConfiguration(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid flex-1 gap-3 overflow-auto p-4 sm:grid-cols-2 xl:grid-cols-3">
              {fields.map((field) => {
                const checked = normalizedVisibleFields.includes(field.key);
                return (
                  <label
                    key={field.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <span className="text-sm font-medium text-slate-700">{field.label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleVisibleField(field.key)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
