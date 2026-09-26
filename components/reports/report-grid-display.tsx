"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Modal from "@/components/ui/Modal";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export type FilterOperator = "contains" | "is" | "notContains" | "empty";

interface ReportGridField<T> {
  key: keyof T | string;
  label: string;
}

interface ReportGridProps<T> {
  title: string;
  records: T[];
  fields: ReportGridField<T>[];
  visibleFields: (keyof T | string)[];
  onVisibleFieldsChange: (fields: (keyof T | string)[]) => void;
  storageKey?: string;
  rowIdSelector: (record: T) => string;
  selectedIds: string[];
  onRowClick: (recordId: string) => void;
  onRecordClick?: (record: T) => void;
  onToggleSelectAll?: (checked: boolean) => void;
  onToggleRowSelection?: (recordId: string, checked: boolean) => void;
  statusOptions?: readonly string[];
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  onNewOrder?: () => void;
  newActionLabel?: string;
  onDeleteSelected?: () => void;
  deleteSelectedLabel?: string;
  onRowAction?: (recordId: string) => void;
  rowActionLabel?: string;
  renderCell: (fieldKey: string, record: T) => React.ReactNode;
  emptyMessage?: string;
}

export function ReportGrid<T>({
  title,
  records,
  fields,
  visibleFields,
  onVisibleFieldsChange,
  storageKey,
  rowIdSelector,
  selectedIds,
  onRowClick,
  onRecordClick,
  onToggleSelectAll,
  onToggleRowSelection,
  statusOptions,
  selectedStatus,
  onStatusChange,
  onNewOrder,
  newActionLabel = "+ New Order",
  onDeleteSelected,
  deleteSelectedLabel = "Delete Selected",
  onRowAction,
  rowActionLabel = "Action",
  renderCell,
  emptyMessage = "No records found.",
}: ReportGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, { operator: FilterOperator; value: string }>>({});
  
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempFilters, setTempFilters] = useState<Record<string, { operator: FilterOperator; value: string }>>({});

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [tempVisibleFields, setTempVisibleFields] = useState<(keyof T | string)[]>([]);

  useEffect(() => {
    if (!storageKey) return;

    try {
      const storedFields = JSON.parse(localStorage.getItem(storageKey) ?? "null") as unknown;
      if (Array.isArray(storedFields)) {
        const validFields = storedFields.filter((field): field is keyof T | string =>
          fields.some((definition) => String(definition.key) === String(field)),
        );
        if (
          validFields.length > 0 &&
          (validFields.length !== visibleFields.length || validFields.some((field, index) => field !== visibleFields[index]))
        ) {
          onVisibleFieldsChange(validFields);
        }
      }
    } catch {
      // Ignore invalid local preferences and keep the report defaults.
    }
  }, [fields, onVisibleFieldsChange, storageKey, visibleFields]);

  const handleOpenColumnModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTempVisibleFields([...visibleFields]);
    setShowColumnModal(true);
  };

  const handleTempToggleField = (fieldKey: string) => {
    setTempVisibleFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((k) => k !== fieldKey) : [...prev, fieldKey]
    );
  };

  const handleSaveColumns = () => {
    onVisibleFieldsChange(tempVisibleFields);
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(tempVisibleFields));
    setShowColumnModal(false);
  };

  const openFilterModal = () => {
    const currentMap: Record<string, { operator: FilterOperator; value: string }> = {};
    for (const f of fields) {
      currentMap[String(f.key)] = columnFilters[String(f.key)] ?? { operator: "contains", value: "" };
    }
    setTempFilters(currentMap);
    setShowFilterModal(true);
  };

  const handleTempFilterChange = (fieldKey: string, operator: FilterOperator, value: string) => {
    setTempFilters((prev) => ({
      ...prev,
      [fieldKey]: { operator, value },
    }));
  };

  const applyAllFilters = () => {
    const active: Record<string, { operator: FilterOperator; value: string }> = {};
    for (const [key, filter] of Object.entries(tempFilters)) {
      if (filter.operator === "empty" || filter.value.trim() !== "") {
        active[key] = filter;
      }
    }
    setColumnFilters(active);
    setShowFilterModal(false);
  };

  const clearAllFilters = () => {
    setTempFilters(() => {
      const resetMap: Record<string, { operator: FilterOperator; value: string }> = {};
      for (const f of fields) {
        resetMap[String(f.key)] = { operator: "contains", value: "" };
      }
      return resetMap;
    });
  };

  const removeAllAppliedFilters = () => {
    setColumnFilters({});
  };

  const visibleFieldDefinitions = fields.filter((f) => visibleFields.includes(f.key));
  const allFilteredSelected = records.length > 0 && records.every((r) => selectedIds.includes(rowIdSelector(r)));
  const activeFilterCount = Object.keys(columnFilters).length;

  const filteredRecords = records.filter((record) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesGlobal = visibleFieldDefinitions.some((field) => {
        const val = renderCell(String(field.key), record);
        return String(val ?? "").toLowerCase().includes(query);
      });
      if (!matchesGlobal) return false;
    }

    for (const [fieldKey, filter] of Object.entries(columnFilters)) {
      const cellVal = String(renderCell(fieldKey, record) ?? "").toLowerCase();
      const targetVal = filter.value.toLowerCase();

      if (filter.operator === "contains" && !cellVal.includes(targetVal)) return false;
      if (filter.operator === "is" && cellVal !== targetVal) return false;
      if (filter.operator === "notContains" && cellVal.includes(targetVal)) return false;
      if (filter.operator === "empty" && cellVal.trim() !== "") return false;
    }

    return true;
  });

  return (
    <div className="space-y-2.5 text-[11px]">
      {statusOptions && selectedStatus && onStatusChange && (
        <Tabs
          tabs={statusOptions.map((st) => ({ label: st.toUpperCase(), value: st }))}
          value={selectedStatus}
          onChange={onStatusChange}
        />
      )}

      {/* HEADER CONTROLS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-slate-200 shadow-none">
        <div>
          <h2 className="text-xs font-bold text-slate-900">{title}</h2>
          <p className="text-[10px] text-slate-500">{filteredRecords.length} records available</p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search report..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-7 text-[11px] py-1 px-2"
          />

          {/* FILTER BUTTON WITH BADGE */}
          <Button
            variant="secondary"
            size="sm"
            onClick={openFilterModal}
            className="text-[11px]"
            title="Advanced Filters"
          >
            <span>🔍 Filter</span>
            {activeFilterCount > 0 && (
              <span className="bg-emerald-700 text-white rounded-full px-1 py-0 text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* EYE BUTTON */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenColumnModal}
            className="text-[11px]"
            title="Manage Columns"
          >
            👁
          </Button>

          {onDeleteSelected && selectedIds.length > 0 && (
            <Button variant="danger" size="sm" onClick={onDeleteSelected} className="h-7 px-2.5 text-[11px]">
              {deleteSelectedLabel} ({selectedIds.length})
            </Button>
          )}

          {/* NEW ORDER BUTTON */}
          {onNewOrder && (
            <Button variant="primary" size="sm" onClick={onNewOrder} className="text-[11px] py-1 px-2.5 h-7">
              {newActionLabel}
            </Button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <Table>
        <thead className="bg-slate-50 text-slate-700 uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="p-2 w-8 text-center">
              <Checkbox
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                checked={allFilteredSelected}
                onChange={(e) => onToggleSelectAll?.(e.target.checked)}
              />
            </th>
            {visibleFieldDefinitions.map((field) => (
              <th key={String(field.key)} className="p-2 font-semibold whitespace-nowrap">
                {field.label}
              </th>
            ))}
            {onRowAction && <th className="p-2 font-semibold whitespace-nowrap">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white text-slate-700 text-[11px]">
          {filteredRecords.length === 0 ? (
            <tr>
              <td colSpan={visibleFieldDefinitions.length + 1 + (onRowAction ? 1 : 0)} className="p-6 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            filteredRecords.map((record, index) => {
              const recordId = rowIdSelector(record);
              const isSelected = selectedIds.includes(recordId);
              return (
                <tr
                  key={recordId}
                  onClick={() => { onRecordClick?.(record); onRowClick(recordId); }}
                  className={`cursor-pointer transition-colors ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  } ${isSelected ? "bg-emerald-50/60" : "hover:bg-slate-100/60"}`}
                >
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                      checked={isSelected}
                      onChange={(e) => onToggleRowSelection?.(recordId, e.target.checked)}
                    />
                  </td>
                  {visibleFieldDefinitions.map((field) => (
                    <td key={`${recordId}-${String(field.key)}`} className="p-2 whitespace-nowrap">
                      {renderCell(String(field.key), record)}
                    </td>
                  ))}
                  {onRowAction && (
                    <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRowAction(recordId)}
                        className="text-[10px]"
                      >
                        {rowActionLabel}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {/* ADVANCED MULTI-FIELD FILTER MODAL */}
      <Modal open={showFilterModal} onClose={() => setShowFilterModal(false)} ariaLabelledBy="report-filter-title" size="lg">
          <div className="space-y-3 p-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 id="report-filter-title" className="text-xs font-bold text-slate-900">Advanced Field Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilterModal(false)}
              >
                ✕
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 font-bold text-[10px] text-slate-600 pb-1 border-b border-slate-200 uppercase tracking-wider">
              <div>1. Field Name</div>
              <div>2. Condition</div>
              <div>3. Value</div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {fields.map((field) => {
                const currentFilter = tempFilters[String(field.key)] ?? { operator: "contains", value: "" };
                return (
                  <div key={String(field.key)} className="grid grid-cols-3 gap-2.5 items-center">
                    <div className="text-[11px] font-medium text-slate-700 truncate" title={field.label}>
                      {field.label}
                    </div>
                    <div>
                      <Select
                        value={currentFilter.operator}
                        onChange={(e) =>
                          handleTempFilterChange(String(field.key), e.target.value as FilterOperator, currentFilter.value)
                        }
                        options={[
                          { value: "contains", label: "Contains" },
                          { value: "is", label: "Is Exact" },
                          { value: "notContains", label: "Does Not Contain" },
                          { value: "empty", label: "Is Empty" },
                        ]}
                        className="h-7 rounded-md p-1 text-[11px]"
                      />
                    </div>
                    <div>
                      {currentFilter.operator !== "empty" ? (
                        <Input
                          value={currentFilter.value}
                          onChange={(e) =>
                            handleTempFilterChange(String(field.key), currentFilter.operator, e.target.value)
                          }
                          placeholder="Value..."
                          className="h-7 rounded-md p-1 text-[11px]"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No value needed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearAllFilters}
                >
                  Clear All
                </Button>
                {activeFilterCount > 0 && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={removeAllAppliedFilters}
                  >
                    Remove Active
                  </Button>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowFilterModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={applyAllFilters}
                >
                  Submit Filters
                </Button>
              </div>
            </div>
          </div>
      </Modal>

      {/* COLUMN MODAL POPUP */}
      <Modal open={showColumnModal} onClose={() => setShowColumnModal(false)} ariaLabelledBy="report-columns-title" size="sm">
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <h3 id="report-columns-title" className="text-[11px] font-bold text-slate-900">Toggle Columns</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowColumnModal(false)}
              >
                ✕
              </Button>
            </div>
            
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {fields.map((field) => {
                const isChecked = tempVisibleFields.includes(field.key);
                return (
                  <div key={String(field.key)} className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-700 select-none hover:bg-slate-50 p-1 rounded">
                    <Checkbox
                      checked={isChecked}
                      onChange={() => handleTempToggleField(String(field.key))}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                      label={field.label}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-1 pt-1.5 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowColumnModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveColumns}
              >
                Submit
              </Button>
            </div>
          </div>
      </Modal>
    </div>
  );
}