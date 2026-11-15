export type MasterSelectionOption = {
  id?: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
  parentValueId?: string | null;
};

type IndexedParentOption<T extends MasterSelectionOption> = {
  option: T;
  index: number;
};

type MasterSelectionIndex<T extends MasterSelectionOption> = {
  exactValues: Map<string, T>;
  normalizedLabels: Map<string, T>;
  byParent: Map<string, IndexedParentOption<T>[]>;
};

const selectionIndexes = new WeakMap<object, MasterSelectionIndex<MasterSelectionOption>>();
const filteredOptions = new WeakMap<
  object,
  WeakMap<object, Map<string, MasterSelectionOption[]>>
>();

function getMasterSelectionIndex<T extends MasterSelectionOption>(
  options: readonly T[],
): MasterSelectionIndex<T> {
  const cached = selectionIndexes.get(options);
  if (cached) return cached as MasterSelectionIndex<T>;

  const exactValues = new Map<string, T>();
  const normalizedLabels = new Map<string, T>();
  const byParent = new Map<string, IndexedParentOption<T>[]>();

  options.forEach((option, index) => {
    for (const value of [option.id, option.value_id, option.label]) {
      if (value && !exactValues.has(value)) exactValues.set(value, option);
    }

    const normalizedLabel = option.label.trim().toLocaleLowerCase();
    if (!normalizedLabels.has(normalizedLabel)) normalizedLabels.set(normalizedLabel, option);

    for (const parentId of new Set([option.parent_id, option.parentValueId].filter(
      (value): value is string => Boolean(value),
    ))) {
      const children = byParent.get(parentId) ?? [];
      children.push({ option, index });
      byParent.set(parentId, children);
    }
  });

  const index = { exactValues, normalizedLabels, byParent };
  selectionIndexes.set(options, index);
  return index;
}

export function clearDependentMasterFields<T extends { key: string; dependsOn?: string; multiple?: boolean }>(
  values: Record<string, unknown>,
  fields: readonly T[],
  parentKey: string,
) {
  const nextValues = { ...values };
  const clearedKeys = new Set<string>([parentKey]);
  const fieldsByParent = new Map<string, T[]>();

  for (const field of fields) {
    if (!field.dependsOn) continue;
    const children = fieldsByParent.get(field.dependsOn) ?? [];
    children.push(field);
    fieldsByParent.set(field.dependsOn, children);
  }

  const pendingKeys = [parentKey];
  for (let index = 0; index < pendingKeys.length; index += 1) {
    for (const field of fieldsByParent.get(pendingKeys[index]) ?? []) {
      if (clearedKeys.has(field.key)) continue;
      nextValues[field.key] = field.multiple ? [] : "";
      clearedKeys.add(field.key);
      pendingKeys.push(field.key);
    }
  }

  return nextValues;
}

export function findMasterSelectionOption<T extends MasterSelectionOption>(
  options: readonly T[],
  value: unknown,
): T | undefined {
  const selectedValue = String(value ?? "").trim();
  if (!selectedValue) return undefined;

  const index = getMasterSelectionIndex(options);
  const exactMatch = index.exactValues.get(selectedValue);
  if (exactMatch) return exactMatch;

  const normalizedValue = selectedValue.toLocaleLowerCase();
  return index.normalizedLabels.get(normalizedValue);
}

export function getMasterSelectionLabel<T extends MasterSelectionOption>(
  options: T[],
  value: unknown,
) {
  const selectedValue = String(value ?? "");
  return findMasterSelectionOption(options, value)?.label ?? selectedValue;
}

export function filterMasterOptionsByParent<T extends MasterSelectionOption, P extends MasterSelectionOption>(
  options: readonly T[],
  parentOptions: readonly P[],
  parentValue: unknown,
): T[] {
  const selectedParent = String(parentValue ?? "").trim();
  let parentResults = filteredOptions.get(options);
  if (!parentResults) {
    parentResults = new WeakMap<object, Map<string, MasterSelectionOption[]>>();
    filteredOptions.set(options, parentResults);
  }
  let resultCache = parentResults.get(parentOptions);
  if (!resultCache) {
    resultCache = new Map<string, MasterSelectionOption[]>();
    parentResults.set(parentOptions, resultCache);
  }
  const cachedResult = resultCache.get(selectedParent);
  if (cachedResult) return cachedResult as T[];

  if (!selectedParent) {
    const allOptions = [...options];
    resultCache.set(selectedParent, allOptions);
    return allOptions;
  }

  const parent = findMasterSelectionOption(parentOptions, selectedParent);
  if (!parent) {
    const noMatches: T[] = [];
    resultCache.set(selectedParent, noMatches);
    return noMatches;
  }

  const childIndex = getMasterSelectionIndex(options);
  const parentKeys = new Set([parent.id, parent.value_id].filter((key): key is string => Boolean(key)));
  const [firstParentKey, secondParentKey] = parentKeys;
  const firstMatches = firstParentKey ? childIndex.byParent.get(firstParentKey) ?? [] : [];
  const secondMatches = secondParentKey ? childIndex.byParent.get(secondParentKey) ?? [] : [];
  let matches: T[];

  if (firstMatches.length === 0) {
    matches = secondMatches.map(({ option }) => option as T);
  } else if (secondMatches.length === 0 || firstParentKey === secondParentKey) {
    matches = firstMatches.map(({ option }) => option as T);
  } else {
    matches = [];
    let firstIndex = 0;
    let secondIndex = 0;
    while (firstIndex < firstMatches.length && secondIndex < secondMatches.length) {
      const firstMatch = firstMatches[firstIndex];
      const secondMatch = secondMatches[secondIndex];
      if (firstMatch.index < secondMatch.index) {
        matches.push(firstMatch.option as T);
        firstIndex += 1;
      } else if (secondMatch.index < firstMatch.index) {
        matches.push(secondMatch.option as T);
        secondIndex += 1;
      } else {
        matches.push(firstMatch.option as T);
        firstIndex += 1;
        secondIndex += 1;
      }
    }
    while (firstIndex < firstMatches.length) matches.push(firstMatches[firstIndex++].option as T);
    while (secondIndex < secondMatches.length) matches.push(secondMatches[secondIndex++].option as T);
  }

  resultCache.set(selectedParent, matches);
  return matches;
}
