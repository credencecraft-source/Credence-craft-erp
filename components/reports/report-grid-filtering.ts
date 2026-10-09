export type FilterOperator = "contains" | "is" | "notContains" | "empty";

export interface IndexedReportRow<T> {
  record: T;
  searchableText: string;
  searchableValues: Record<string, string>;
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
