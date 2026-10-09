"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  filterIndexedReportRecords,
  type FilterOperator,
  type IndexedReportRow,
} from "./report-grid-filtering";

export type { FilterOperator } from "./report-grid-filtering";

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
  selectable?: boolean;
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
  onBulkUpload?: () => void;
  bulkUploadLabel?: string;
  bulkUploadDisabled?: boolean;
  onRowAction?: (recordId: string) => void;
  onSecondaryRowAction?: (recordId: string) => void;
  rowActionPosition?: "start" | "end";
  rowActionLabel?: string;
  rowActionLabelSelector?: (record: T) => string;
  rowActionDisabledSelector?: (record: T) => boolean;
  secondaryRowActionLabel?: string;
  secondaryRowActionLabelSelector?: (record: T) => string;
  secondaryRowActionDisabledSelector?: (record: T) => boolean;
  wrapCells?: boolean;
  toolbarActions?: ReactNode;
  onSearchQueryChange?: (query: string) => void;
  renderCell: (fieldKey: string, record: T) => React.ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
}

function ReportGridImplementation<T>({
  title,
  records,
  fields,
  visibleFields,
  onVisibleFieldsChange,
  storageKey,
  rowIdSelector,
  selectedIds,
  selectable = true,
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
  onBulkUpload,
  bulkUploadLabel = "Bulk Upload",
  bulkUploadDisabled = false,
  onRowAction,
  onSecondaryRowAction,
  rowActionPosition = "end",
  rowActionLabel = "Action",
  rowActionLabelSelector,
  rowActionDisabledSelector,
  secondaryRowActionLabel = "Action",
  secondaryRowActionLabelSelector,
  secondaryRowActionDisabledSelector,
  wrapCells = false,
  toolbarActions,
  onSearchQueryChange,
  renderCell,
  isLoading = false,
  emptyMessage = "No records found.",
}: ReportGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const tableContainerRef = useRef<HTMLDivElement>(null);
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

  const visibleFieldDefinitions = useMemo(
    () => fields.filter((field) => visibleFields.includes(field.key)),
    [fields, visibleFields],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected = records.length > 0 && records.every((record) => selectedIdSet.has(rowIdSelector(record)));
  const activeFilterCount = Object.keys(columnFilters).length;
  const indexedFieldKeys = useMemo(
    () => [...new Set([
      ...visibleFieldDefinitions.map((field) => String(field.key)),
      ...Object.keys(columnFilters),
    ])],
    [columnFilters, visibleFieldDefinitions],
  );
  const indexedRecords = useMemo(
    () => records.map<IndexedReportRow<T>>((record) => {
      const searchableValues: Record<string, string> = {};
      for (const fieldKey of indexedFieldKeys) {
        searchableValues[fieldKey] = String(renderCell(fieldKey, record) ?? "").toLowerCase();
      }
      return {
        record,
        searchableText: visibleFieldDefinitions
          .map((field) => searchableValues[String(field.key)] ?? "")
          .join(" "),
        searchableValues,
      };
    }),
    [indexedFieldKeys, records, renderCell, visibleFieldDefinitions],
  );

  const filteredRecords = useMemo(
    () => filterIndexedReportRecords(indexedRecords, deferredSearchQuery, columnFilters),
    [columnFilters, deferredSearchQuery, indexedRecords],
  );
  const virtualizeRows = filteredRecords.length > 100;
  // The virtualizer's imperative API is required for measuring and scrolling large report tables.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: virtualizeRows ? filteredRecords.length : 0,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40,
    initialRect: { width: 0, height: 600 },
    overscan: 8,
  });
  const virtualRows = virtualizeRows
    ? rowVirtualizer.getVirtualItems().map(({ index, start, size, key }) => ({ index, start, size, key }))
    : filteredRecords.map((record, index) => ({
        index,
        start: 0,
        size: 0,
        key: rowIdSelector(record),
      }));
  const topSpacerHeight = virtualizeRows ? (virtualRows[0]?.start ?? 0) : 0;
  const lastVirtualRow = virtualRows.at(-1);
  const bottomSpacerHeight = virtualizeRows && lastVirtualRow
    ? Math.max(0, rowVirtualizer.getTotalSize() - lastVirtualRow.start - lastVirtualRow.size)
    : 0;

  useEffect(() => {
    if (virtualizeRows) tableContainerRef.current?.scrollTo({ top: 0 });
  }, [columnFilters, deferredSearchQuery, virtualizeRows]);

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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onSearchQueryChange?.(e.target.value);
            }}
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

          {toolbarActions}

          {onDeleteSelected && selectedIds.length > 0 && (
            <Button variant="danger" size="sm" onClick={onDeleteSelected} className="h-7 px-2.5 text-[11px]">
              {deleteSelectedLabel} ({selectedIds.length})
            </Button>
          )}

          {onBulkUpload && selectedIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onBulkUpload}
              disabled={bulkUploadDisabled}
              className="h-7 px-2.5 text-[11px]"
            >
              {bulkUploadDisabled ? "Preparing..." : `${bulkUploadLabel} (${selectedIds.length})`}
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
      <Table
        aria-busy={isLoading || searchQuery !== deferredSearchQuery}
        className={virtualizeRows ? "max-h-[70vh] overflow-y-auto" : undefined}
        containerRef={tableContainerRef}
      >
        <thead className={`bg-slate-50 text-slate-700 uppercase tracking-wider text-[10px] border-b border-slate-200 ${virtualizeRows ? "sticky top-0 z-10" : ""}`}>
          <tr>
            {selectable && (
              <th className="p-2 w-8 text-center">
                <Checkbox
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                  checked={allFilteredSelected}
                  onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                />
              </th>
            )}
            {(onRowAction || onSecondaryRowAction) && rowActionPosition === "start" && <th className="p-2 font-semibold whitespace-nowrap">Actions</th>}
            {visibleFieldDefinitions.map((field) => (
              <th key={String(field.key)} className="p-2 font-semibold whitespace-nowrap">
                {field.label}
              </th>
            ))}
            {(onRowAction || onSecondaryRowAction) && rowActionPosition === "end" && <th className="p-2 font-semibold whitespace-nowrap">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white text-slate-700 text-[11px]">
          {isLoading && filteredRecords.length === 0 ? (
            Array.from({ length: 6 }, (_, index) => (
              <tr key={`loading-${index}`}>
                {selectable && <td className="p-2"><Skeleton className="mx-auto h-3 w-3" /></td>}
                {(onRowAction || onSecondaryRowAction) && rowActionPosition === "start" && (
                  <td className="p-2"><Skeleton className="h-6 w-14" /></td>
                )}
                {visibleFieldDefinitions.map((field) => (
                  <td key={`loading-${index}-${String(field.key)}`} className="p-2">
                    <Skeleton className="h-3 w-24" />
                  </td>
                ))}
                {(onRowAction || onSecondaryRowAction) && rowActionPosition === "end" && (
                  <td className="p-2"><Skeleton className="h-6 w-14" /></td>
                )}
              </tr>
            ))
          ) : filteredRecords.length === 0 ? (
            <tr>
              <td colSpan={visibleFieldDefinitions.length + (selectable ? 1 : 0) + (onRowAction || onSecondaryRowAction ? 1 : 0)} className="p-6 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            <>
              {topSpacerHeight > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={visibleFieldDefinitions.length + (selectable ? 1 : 0) + (onRowAction || onSecondaryRowAction ? 1 : 0)}
                    style={{ height: topSpacerHeight, padding: 0, border: 0 }}
                  />
                </tr>
              )}
              {virtualRows.map(({ index, size, key }) => {
              const record = filteredRecords[index];
              const recordId = rowIdSelector(record);
              const isSelected = selectedIdSet.has(recordId);
              return (
                <tr
                  key={virtualizeRows ? key : recordId}
                  ref={virtualizeRows ? rowVirtualizer.measureElement : undefined}
                  data-index={virtualizeRows ? index : undefined}
                  style={virtualizeRows ? { height: size } : undefined}
                  onClick={() => { onRecordClick?.(record); onRowClick(recordId); }}
                  className={`cursor-pointer transition-colors ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                  } ${isSelected ? "bg-emerald-50/60" : "hover:bg-slate-100/60"}`}
                >
                  {selectable && (
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                        checked={isSelected}
                        onChange={(e) => onToggleRowSelection?.(recordId, e.target.checked)}
                      />
                    </td>
                  )}
                  {(onRowAction || onSecondaryRowAction) && rowActionPosition === "start" && (
                    <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {onRowAction ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onRowAction(recordId)}
                            disabled={rowActionDisabledSelector?.(record)}
                            className="text-[10px]"
                          >
                            {rowActionLabelSelector?.(record) ?? rowActionLabel}
                          </Button>
                        ) : null}
                        {onSecondaryRowAction ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onSecondaryRowAction(recordId)}
                            disabled={secondaryRowActionDisabledSelector?.(record)}
                            className="text-[10px]"
                          >
                            {secondaryRowActionLabelSelector?.(record) ?? secondaryRowActionLabel}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  )}
                  {visibleFieldDefinitions.map((field) => (
                    <td
                      key={`${recordId}-${String(field.key)}`}
                      className={`p-2 ${
                        wrapCells
                          ? "max-w-[16rem] whitespace-normal break-words [overflow-wrap:anywhere]"
                          : "whitespace-nowrap"
                      }`}
                    >
                      {renderCell(String(field.key), record)}
                    </td>
                  ))}
                  {(onRowAction || onSecondaryRowAction) && rowActionPosition === "end" && (
                    <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {onRowAction ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onRowAction(recordId)}
                            disabled={rowActionDisabledSelector?.(record)}
                            className="text-[10px]"
                          >
                            {rowActionLabelSelector?.(record) ?? rowActionLabel}
                          </Button>
                        ) : null}
                        {onSecondaryRowAction ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onSecondaryRowAction(recordId)}
                            disabled={secondaryRowActionDisabledSelector?.(record)}
                            className="text-[10px]"
                          >
                            {secondaryRowActionLabelSelector?.(record) ?? secondaryRowActionLabel}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              );
              })}
              {bottomSpacerHeight > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={visibleFieldDefinitions.length + (selectable ? 1 : 0) + (onRowAction || onSecondaryRowAction ? 1 : 0)}
                    style={{ height: bottomSpacerHeight, padding: 0, border: 0 }}
                  />
                </tr>
              )}
            </>
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

export const ReportGrid = React.memo(ReportGridImplementation) as typeof ReportGridImplementation;