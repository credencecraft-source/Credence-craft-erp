import { bench, describe } from "vitest";

import {
  clearDependentMasterFields,
  filterMasterOptionsByParent,
  findMasterSelectionOption,
} from "./master-data-selection";

const selectionCount = 20_000;
const parents = [
  { id: "parent-a", value_id: "parent-value-a", label: "Parent A" },
  { id: "parent-b", value_id: "parent-value-b", label: "Parent B" },
];
const options: Array<{
  id: string;
  value_id: string;
  label: string;
  parent_id?: string;
  parentValueId?: string;
}> = Array.from({ length: selectionCount }, (_, index) => ({
  id: `option-${index}`,
  value_id: `option-value-${index}`,
  label: `Option ${index}`,
  ...(index % 2 === 0
    ? { parent_id: "parent-a" }
    : { parentValueId: "parent-value-b" }),
}));
const parentValues = ["Parent A", "Parent B"];
let nextParent = 0;

function legacyFind<T extends { id?: string; value_id?: string; label: string }>(
  optionsToSearch: readonly T[],
  value: string,
) {
  const exactMatch = optionsToSearch.find((option) => (
    option.id === value || option.value_id === value || option.label === value
  ));
  if (exactMatch) return exactMatch;
  const normalizedValue = value.toLocaleLowerCase();
  return optionsToSearch.find((option) => option.label.trim().toLocaleLowerCase() === normalizedValue);
}

describe("master dropdown large-catalog benchmarks", () => {
  bench("before: linear option resolution at 20,000 entries", () => {
    legacyFind(options, "Option 19999");
  });

  bench("after: warm indexed option resolution at 20,000 entries", () => {
    findMasterSelectionOption(options, "Option 19999");
  });

  bench("before: filter 20,000 options for every parent change", () => {
    const parent = parents[nextParent++ % parentValues.length];
    const resolvedParent = legacyFind(parents, parent.label);
    if (!resolvedParent) return;
    const parentKeys = new Set([resolvedParent.id, resolvedParent.value_id].filter(Boolean));
    options.filter((option) => (
      [option.parent_id, option.parentValueId].some((key) => key && parentKeys.has(key))
    ));
  });

  bench("after: cached indexed filter across alternating parent changes", () => {
    const parentValue = parentValues[nextParent++ % parentValues.length];
    filterMasterOptionsByParent(options, parents, parentValue);
  });

  const fields = Array.from({ length: 1_000 }, (_, index) => ({
    key: `Field_${index}`,
    dependsOn: index === 0 ? "Parent" : `Field_${index - 1}`,
  })).reverse();

  bench("before: repeated full scans for a 1,000-field cascade", () => {
    const pendingValues: Record<string, unknown> = { Parent: "selected" };
    const clearedKeys = new Set(["Parent"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const field of fields) {
        if (!clearedKeys.has(field.dependsOn) || clearedKeys.has(field.key)) continue;
        pendingValues[field.key] = "";
        clearedKeys.add(field.key);
        changed = true;
      }
    }
  });

  bench("after: one-pass indexed traversal for a 1,000-field cascade", () => {
    clearDependentMasterFields(
      { Parent: "selected" },
      fields,
      "Parent",
    );
  });
});
