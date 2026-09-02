"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import Input from "@/components/ui/Input";

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
  onToggleSelectAll?: (checked: boolean) => void;
  onToggleRowSelection?: (recordId: string, checked: boolean) => void;
  statusOptions?: readonly string[];
  selectedStatus?: string;
  onStatusChange?: (status: string) => void;
  onNewOrder?: () => void;
  renderCell: (fieldKey: string, record: T) => React.ReactNode;
  emptyMessage?: string;
}

export function ReportGrid<T>({
  title,
  records,
  fields,
  visibleFields,
  onVisibleFieldsChange,
  rowIdSelector,
  selectedIds,
  onRowClick,
  onToggleSelectAll,
  onToggleRowSelection,
  statusOptions,
  selectedStatus,
  onStatusChange,
  onNewOrder,
  renderCell,
  emptyMessage = "No records found.",
}: ReportGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, { operator: FilterOperator; value: string }>>({});
  
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempFilters, setTempFilters] = useState<Record<string, { operator: FilterOperator; value: string }>>({});

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [tempVisibleFields, setTempVisibleFields] = useState<(keyof T | string)[]>([]);

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
          <button
            type="button"
            onClick={openFilterModal}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium border border-slate-300 transition-colors flex items-center gap-1.5 relative"
            title="Advanced Filters"
          >
            <span>🔍 Filter</span>
            {activeFilterCount > 0 && (
              <span className="bg-emerald-700 text-white rounded-full px-1 py-0 text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* EYE BUTTON */}
          <button
            type="button"
            onClick={handleOpenColumnModal}
            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium border border-slate-300 transition-colors flex items-center justify-center"
            title="Manage Columns"
          >
            👁
          </button>

          {/* NEW ORDER BUTTON */}
          {onNewOrder && (
            <Button variant="primary" size="sm" onClick={onNewOrder} className="text-[11px] py-1 px-2.5 h-7">
              + New Order
            </Button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <Table>
        <thead className="bg-slate-50 text-slate-700 uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="p-2 w-8 text-center">
              <input
                type="checkbox"
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white text-slate-700 text-[11px]">
          {filteredRecords.length === 0 ? (
            <tr>
              <td colSpan={visibleFieldDefinitions.length + 1} className="p-6 text-center text-slate-500">
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
                  onClick={() => onRowClick(recordId)}
                  className={`cursor-pointer transition-colors ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  } ${isSelected ? "bg-emerald-50/60" : "hover:bg-slate-100/60"}`}
                >
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
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
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      {/* ADVANCED MULTI-FIELD FILTER MODAL */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900">Advanced Field Filters</h3>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
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
                      <select
                        value={currentFilter.operator}
                        onChange={(e) =>
                          handleTempFilterChange(String(field.key), e.target.value as FilterOperator, currentFilter.value)
                        }
                        className="w-full border border-slate-300 rounded-md p-1 text-[11px] bg-white h-7"
                      >
                        <option value="contains">Contains</option>
                        <option value="is">Is Exact</option>
                        <option value="notContains">Does Not Contain</option>
                        <option value="empty">Is Empty</option>
                      </select>
                    </div>
                    <div>
                      {currentFilter.operator !== "empty" ? (
                        <input
                          type="text"
                          value={currentFilter.value}
                          onChange={(e) =>
                            handleTempFilterChange(String(field.key), currentFilter.operator, e.target.value)
                          }
                          placeholder="Value..."
                          className="w-full border border-slate-300 rounded-md p-1 text-[11px] h-7"
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
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium"
                >
                  Clear All
                </button>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={removeAllAppliedFilters}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-md text-[11px] font-medium"
                  >
                    Remove Active
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyAllFilters}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[11px] font-medium"
                >
                  Submit Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COLUMN MODAL POPUP */}
      {showColumnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xs p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <h3 className="text-[11px] font-bold text-slate-900">Toggle Columns</h3>
              <button
                type="button"
                onClick={() => setShowColumnModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>
            
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {fields.map((field) => {
                const isChecked = tempVisibleFields.includes(field.key);
                return (
                  <label key={String(field.key)} className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-700 select-none hover:bg-slate-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTempToggleField(String(field.key))}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-1 pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowColumnModal(false)}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveColumns}
                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[11px] font-medium"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}