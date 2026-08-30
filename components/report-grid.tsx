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
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) ?? {};
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
  emptyMessage = "No matching records found.",
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
    [fields, normalizedVisibleFields]
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
      })
    );
  }, [columnFilters, normalizedVisibleFields, storageKey]);

  useEffect(() => {
    if (!activeFilterField || activeFilterOperator === "empty") return;
    const timer = window.setTimeout(() => {
      filterValueInputRef.current?.focus();
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
  };

  const handleToggleVisibleField = (fieldKey: string) => {
    const next = normalizedVisibleFields.includes(fieldKey)
      ? normalizedVisibleFields.filter((value) => value !== fieldKey)
      : [...normalizedVisibleFields, fieldKey];

    if (next.length === 0) return;
    onVisibleFieldsChange(next);
  };

  const allFilteredSelected = useMemo(
    () => filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.includes(rowIdSelector(record))),
    [filteredRecords, rowIdSelector, selectedIds]
  );

  return (
    <div >
      {/* STATUS FILTER TABS */}
      {statusOptions && statusOptions.length > 0 && (
        <div >
          {statusOptions.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange?.(status)}
              className={`h-6 rounded px-2 text-[10px] font-bold uppercase transition ${
                selectedStatus === status
                  ? "bg-emerald-700 text-white"
                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      )}

      {/* CONTROL HEADER */}
      <div >
        <div >
          <h3 >{title}</h3>
          <span >
            {filteredRecords.length} records
          </span>
        </div>

        <div >
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search report..."
            
          />
          <button
            type="button"
            onClick={() => setShowFieldConfiguration(true)}
            
          >
            Columns
          </button>
          {onNewOrder && (
            <button
              type="button"
              onClick={onNewOrder}
              
            >
              + New Order
            </button>
          )}
        </div>
      </div>

      {/* DATA GRID TABLE */}
      <div >
        <table >
          <thead >
            <tr>
              <th >
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                  
                />
              </th>
              {visibleFieldDefinitions.map((field) => (
                <th key={field.key} >
                  <div >
                    <button
                      type="button"
                      onClick={() => openFilterForField(field.key, field.label)}
                      
                    >
                      {field.label}
                    </button>
                    {columnFilters[field.key] && (
                      <button
                        type="button"
                        onClick={() => removeFilterForField(field.key)}
                        
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* FILTER DROPDOWN POPUP */}
                  {activeFilterField?.field === field.key && (
                    <div >
                      <p >Filter: {activeFilterField.label}</p>
                      <div >
                        <select
                          value={activeFilterOperator}
                          onChange={(e) => setActiveFilterOperator(e.target.value as FilterOperator)}
                          
                        >
                          <option value="contains">Contains</option>
                          <option value="is">Is Exact</option>
                          <option value="notContains">Does Not Contain</option>
                          <option value="empty">Is Empty</option>
                        </select>
                        {activeFilterOperator !== "empty" && (
                          <input
                            ref={filterValueInputRef}
                            value={activeFilterValue}
                            onChange={(e) => setActiveFilterValue(e.target.value)}
                            placeholder="Value..."
                            
                          />
                        )}
                      </div>
                      <div >
                        <button
                          type="button"
                          onClick={clearActiveFilter}
                          
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={applyActiveFilter}
                          
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={visibleFieldDefinitions.length + 1} >
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
                    className={`border-b border-slate-200 cursor-pointer transition ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    } ${selectedRowId === recordId ? "bg-emerald-50" : "hover:bg-slate-100/80"}`}
                  >
                    <td  onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(recordId)}
                        onChange={(e) => onToggleRowSelection?.(recordId, e.target.checked)}
                        
                      />
                    </td>
                    {visibleFieldDefinitions.map((field) => (
                      <td key={`${recordId}-${field.key}`} >
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

      {/* COLUMN SELECTION MODAL */}
      {showFieldConfiguration && (
        <div >
          <div >
            <div >
              <h3 >Configure Visible Columns</h3>
              <button
                type="button"
                onClick={() => setShowFieldConfiguration(false)}
                
              >
                ✕
              </button>
            </div>
            <div >
              {fields.map((field) => (
                <label key={field.key} >
                  <input
                    type="checkbox"
                    checked={normalizedVisibleFields.includes(field.key)}
                    onChange={() => handleToggleVisibleField(field.key)}
                    
                  />
                  {field.label}
                </label>
              ))}
            </div>
            <div >
              <button
                type="button"
                onClick={() => setShowFieldConfiguration(false)}
                
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}