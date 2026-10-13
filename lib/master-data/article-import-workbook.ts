import type { ParsedMasterWorkbookRow } from "@/lib/master-data/master-records-workbook";

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function valueKey(value: unknown) {
  return JSON.stringify(value);
}

function mergeField(
  values: Record<string, unknown>,
  key: string,
  value: unknown,
  label: string,
  rowNumbers: number[],
) {
  if (isEmpty(value)) return;
  const current = values[key];
  if (!isEmpty(current) && valueKey(current) !== valueKey(value)) {
    throw new Error(
      `Article "${String(values.article ?? "")}" has conflicting ${label} values in spreadsheet rows ${rowNumbers.join(", ")}.`,
    );
  }
  values[key] = value;
}

export function groupArticleMatrixRows(rows: ParsedMasterWorkbookRow[]) {
  const groups = new Map<string, ParsedMasterWorkbookRow[]>();
  for (const row of rows) {
    const article = String(row.fields.article ?? "").trim();
    if (!article) {
      throw new Error(`Spreadsheet row ${row.rowNumber} is missing its Article Name.`);
    }
    const key = article.toLocaleLowerCase();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = structuredClone(group[0]);
    const rowNumbers = group.map((row) => row.rowNumber);
    const fields = { ...first.fields };
    const sizes: string[] = [];
    const variantsByColor = new Map<string, Record<string, unknown>>();
    let code = first.code;
    let description = first.description;

    for (const row of group) {
      for (const [key, value] of Object.entries(row.fields)) {
        if (key === "Sizes" || key === "Size_Group") continue;
        mergeField(fields, key, value, key, rowNumbers);
      }
      for (const size of Array.isArray(row.fields.Sizes) ? row.fields.Sizes : []) {
        if (typeof size !== "string" || !size.trim()) continue;
        if (!sizes.some((existing) => existing.toLocaleLowerCase() === size.toLocaleLowerCase())) {
          sizes.push(size.trim());
        }
      }
      const sizeGroup = row.fields.Size_Group;
      mergeField(fields, "Size_Group", sizeGroup, "Size Group", rowNumbers);

      for (const variant of Array.isArray(row.childRows.variants) ? row.childRows.variants : []) {
        const color = String(variant.color ?? "").trim();
        if (!color) continue;
        const colorKey = color.toLocaleLowerCase();
        const existing = variantsByColor.get(colorKey);
        if (!existing) {
          variantsByColor.set(colorKey, { ...variant });
          continue;
        }
        for (const [key, value] of Object.entries(variant)) {
          if (key === "color" || isEmpty(value)) continue;
          const previous = existing[key];
          if (!isEmpty(previous) && valueKey(previous) !== valueKey(value)) {
            throw new Error(
              `Article "${String(fields.article ?? "")}" color "${color}" has conflicting ${key} values in spreadsheet rows ${rowNumbers.join(", ")}.`,
            );
          }
          existing[key] = value;
        }
      }

      if (row.code && code && row.code.toLocaleLowerCase() !== code.toLocaleLowerCase()) {
        throw new Error(`Article "${String(fields.article ?? "")}" has conflicting Master Code values in spreadsheet rows ${rowNumbers.join(", ")}.`);
      }
      if (!code) code = row.code;
      if (row.description && description && row.description !== description) {
        throw new Error(`Article "${String(fields.article ?? "")}" has conflicting Description values in spreadsheet rows ${rowNumbers.join(", ")}.`);
      }
      if (!description) description = row.description;
    }

    fields.Sizes = sizes;
    if (sizes.length > 0 && isEmpty(fields.Size_Group)) {
      fields.Size_Group = sizes.join(",");
    }
    return {
      ...first,
      code,
      description,
      fields,
      childRows: {
        ...first.childRows,
        variants: [...variantsByColor.values()],
      },
    };
  });
}
