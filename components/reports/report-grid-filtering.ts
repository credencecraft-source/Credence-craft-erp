export type FilterOperator = "contains" | "is" | "notContains" | "empty";

export interface IndexedReportRow<T> {
  record: T;
  searchableText: string;
  searchableValues: Record<string, string>;
}

export function toggleVisibleReportSelection(
  selectedIds: string[],
  visibleIds: string[],
  checked: boolean,
) {
  const visibleIdSet = new Set(visibleIds);
  return checked
    ? [...new Set([...selectedIds, ...visibleIds])]
    : selectedIds.filter((id) => !visibleIdSet.has(id));
}

export function getEffectiveReportSearchQuery(query: string, minimumLength = 0) {
  const normalizedQuery = query.trim();
  return normalizedQuery.length >= minimumLength ? normalizedQuery : "";
}

export function getReportSearchValue<T>(
  record: T,
  fieldKey: string,
  getSearchValue: ((fieldKey: string, record: T) => string) | undefined,
  renderCell: (fieldKey: string, record: T) => unknown,
) {
  const customValue = getSearchValue?.(fieldKey, record);
  if (customValue !== undefined) return customValue.toLowerCase();

  const rawValue = typeof record === "object" && record !== null
    ? Reflect.get(record, fieldKey)
    : undefined;
  if (
    typeof rawValue === "string"
    || typeof rawValue === "number"
    || typeof rawValue === "boolean"
    || typeof rawValue === "bigint"
  ) {
    return String(rawValue).toLowerCase();
  }

  return String(renderCell(fieldKey, record) ?? "").toLowerCase();
}

export function filterIndexedReportRecords<T>(
  indexedRecords: IndexedReportRow<T>[],
  searchQuery: string,
  columnFilters: Record<string, { operator: FilterOperator; value: string }>,
) {
  const query = searchQuery.toLowerCase();

  return indexedRecords
    .filter(({ searchableText, searchableValues }) => {
      if (query && !searchableText.includes(query)) return false;

      for (const [fieldKey, filter] of Object.entries(columnFilters)) {
        const cellValue = searchableValues[fieldKey] ?? "";
        const targetValue = filter.value.toLowerCase();

        if (filter.operator === "contains" && !cellValue.includes(targetValue)) return false;
        if (filter.operator === "is" && cellValue !== targetValue) return false;
        if (filter.operator === "notContains" && cellValue.includes(targetValue)) return false;
        if (filter.operator === "empty" && cellValue.trim() !== "") return false;
      }

      return true;
    })
    .map(({ record }) => record);
}
