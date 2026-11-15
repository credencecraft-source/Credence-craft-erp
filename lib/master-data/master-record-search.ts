type MasterRecordSearchSource = {
  label: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
};

type MasterFieldSearchValue<T extends MasterRecordSearchSource> = (fieldKey: string, record: T) => string;

export function getMasterRecordSearchValue<T extends MasterRecordSearchSource>(
  fieldKey: string,
  record: T,
  getFieldValue: MasterFieldSearchValue<T>,
): string {
  switch (fieldKey) {
    case "label":
      return record.label;
    case "code":
      return record.code || "\u2014";
    case "description":
      return record.description || "\u2014";
    case "status":
      return record.is_active ? "Active" : "Pending";
    case "actions":
      // The previous generic renderer stringified this React element to this value.
      // Keep the same search text without constructing action controls for every row.
      return "[object Object]";
    default:
      return getFieldValue(fieldKey, record);
  }
}
