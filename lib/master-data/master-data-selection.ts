export type MasterSelectionOption = {
  id?: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
  parentValueId?: string | null;
};

export function findMasterSelectionOption<T extends MasterSelectionOption>(
  options: T[],
  value: unknown,
): T | undefined {
  const selectedValue = String(value ?? "").trim();
  if (!selectedValue) return undefined;

  const exactMatch = options.find((option) => (
    option.id === selectedValue
    || option.value_id === selectedValue
    || option.label === selectedValue
  ));
  if (exactMatch) return exactMatch;

  const normalizedValue = selectedValue.toLocaleLowerCase();
  return options.find((option) => option.label.trim().toLocaleLowerCase() === normalizedValue);
}

export function getMasterSelectionLabel<T extends MasterSelectionOption>(
  options: T[],
  value: unknown,
) {
  const selectedValue = String(value ?? "");
  return findMasterSelectionOption(options, value)?.label ?? selectedValue;
}

export function filterMasterOptionsByParent<T extends MasterSelectionOption, P extends MasterSelectionOption>(
  options: T[],
  parentOptions: P[],
  parentValue: unknown,
): T[] {
  const selectedParent = String(parentValue ?? "").trim();
  if (!selectedParent) return options;

  const parent = findMasterSelectionOption(parentOptions, selectedParent);
  if (!parent) return [];

  const parentKeys = new Set([parent.id, parent.value_id].filter((key): key is string => Boolean(key)));
  return options.filter((option) => (
    [option.parent_id, option.parentValueId].some((key) => key && parentKeys.has(key))
  ));
}
