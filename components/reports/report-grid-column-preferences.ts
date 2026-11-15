export function migrateReportGridVisibleFields(
  storedFields: readonly unknown[],
  availableFields: readonly string[],
  fieldsToAdd: readonly string[],
) {
  const available = new Set(availableFields);
  const visibleFields = storedFields
    .filter((field): field is string => typeof field === "string" && available.has(field));

  for (const field of fieldsToAdd) {
    if (available.has(field) && !visibleFields.includes(field)) {
      visibleFields.push(field);
    }
  }

  return visibleFields;
}
