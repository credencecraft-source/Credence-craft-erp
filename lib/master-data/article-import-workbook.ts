import type { ParsedMasterWorkbookRow } from "@/lib/master-data/master-records-workbook";

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function valueKey(value: unknown) {
  return JSON.stringify(value);
}

function priceKey(value: unknown) {
  if (isEmpty(value)) return "";
  const text = String(value).trim();
  const [integer, fraction = ""] = text.split(".");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${integer}.${normalizedFraction}` : integer;
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

export type ArticleMatrixGroupingFailure = {
  rowNumber: number;
  message: string;
  fieldPaths: string[];
  row: ParsedMasterWorkbookRow;
  checkpoint: "ARTICLE_MATRIX_CONFLICT";
};

export function groupArticleMatrixRowsWithErrors(rows: ParsedMasterWorkbookRow[]) {
  const groups = new Map<string, ParsedMasterWorkbookRow[]>();
  const failures: ArticleMatrixGroupingFailure[] = [];
  for (const row of rows) {
    const article = String(row.fields.article ?? "").trim();
    if (!article) {
      failures.push({
        rowNumber: row.rowNumber,
        message: `Spreadsheet row ${row.rowNumber} is missing its Article Name.`,
        fieldPaths: ["article"],
        row,
        checkpoint: "ARTICLE_MATRIX_CONFLICT",
      });
      continue;
    }
    const key = article.toLocaleLowerCase();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const groupedRows: ParsedMasterWorkbookRow[] = [];
  for (const group of groups.values()) {
    try {
      groupedRows.push(groupArticleMatrixRowGroup(group));
    } catch (error) {
      const first = group[0];
      failures.push({
        rowNumber: first.rowNumber,
        message: error instanceof Error ? error.message : "Article rows could not be grouped safely.",
        fieldPaths: [/conflicting ([\w.]+) values/i.exec(error instanceof Error ? error.message : "")?.[1] ?? ""]
          .filter(Boolean),
        row: first,
        checkpoint: "ARTICLE_MATRIX_CONFLICT",
      });
    }
  }
  return {
    rows: groupedRows.sort((first, second) => first.rowNumber - second.rowNumber),
    failures: failures.sort((first, second) => first.rowNumber - second.rowNumber),
  };
}

function groupArticleMatrixRowGroup(group: ParsedMasterWorkbookRow[]) {
    const first = structuredClone(group[0]);
    const rowNumbers = group.map((row) => row.rowNumber);
    const fields = { ...first.fields };
    const sizes: string[] = [];
    const pricesBySize = new Map<string, { size: string; price: unknown; rowNumbers: number[] }>();
    const variantsByColor = new Map<string, Record<string, unknown>>();
    const unassignedPrices: Array<{ price: unknown; rowNumber: number }> = [];
    let code = first.code;
    let description = first.description;

    for (const row of group) {
      for (const [key, value] of Object.entries(row.fields)) {
        if (key === "Sizes" || key === "Size_Group" || key === "default_price") continue;
        mergeField(fields, key, value, key, rowNumbers);
      }
      const rowSizes = Array.isArray(row.fields.Sizes)
        ? row.fields.Sizes.filter((size): size is string => typeof size === "string" && Boolean(size.trim()))
        : [];
      const rowPrice = row.fields.default_price;
      if (rowSizes.length === 0 && !isEmpty(rowPrice)) {
        unassignedPrices.push({ price: rowPrice, rowNumber: row.rowNumber });
      }
      for (const rawSize of rowSizes) {
        const size = rawSize.trim();
        const sizeKey = size.toLocaleLowerCase();
        if (typeof size !== "string" || !size.trim()) continue;
        if (!sizes.some((existing) => existing.toLocaleLowerCase() === sizeKey)) {
          sizes.push(size.trim());
        }
        if (!isEmpty(rowPrice)) {
          const existingPrice = pricesBySize.get(sizeKey);
          if (existingPrice && priceKey(existingPrice.price) !== priceKey(rowPrice)) {
            const conflictingRows = [...existingPrice.rowNumbers, row.rowNumber];
            throw new Error(
              `Article "${String(fields.article ?? "")}" size "${size}" has conflicting prices in spreadsheet rows ${conflictingRows.join(", ")}.`,
            );
          }
          if (existingPrice) existingPrice.rowNumbers.push(row.rowNumber);
          else pricesBySize.set(sizeKey, { size, price: rowPrice, rowNumbers: [row.rowNumber] });
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

    const sizePrices = sizes.map((size) => pricesBySize.get(size.toLocaleLowerCase())
      ?? { size, price: null, rowNumbers: [] });
    const distinctPriceKeys = new Set(sizePrices.map(({ price }) => priceKey(price)));
    const sizePricingIsUniform = sizePrices.length > 0
      && sizePrices.every(({ price }) => !isEmpty(price))
      && distinctPriceKeys.size === 1;
    const unassignedPriceKeys = new Set(unassignedPrices.map(({ price }) => priceKey(price)));
    if (unassignedPriceKeys.size > 1
      || (unassignedPrices.length > 0 && sizePrices.length > 0
        && sizePrices.some(({ price }) => !isEmpty(price)
          && priceKey(price) !== priceKey(unassignedPrices[0].price)))) {
      const conflictingRows = [...new Set([
        ...unassignedPrices.map(({ rowNumber }) => rowNumber),
        ...sizePrices.flatMap(({ rowNumbers }) => rowNumbers),
      ])];
      throw new Error(
        `Article "${String(fields.article ?? "")}" has conflicting unassigned and size prices in spreadsheet rows ${conflictingRows.join(", ")}.`,
      );
    }
    if (sizePricingIsUniform) {
      fields.default_price = sizePrices[0].price;
      fields.Size_Prices = [];
    } else if (sizePrices.some(({ price }) => !isEmpty(price))) {
      fields.default_price = null;
      fields.Size_Prices = sizePrices.map(({ size, price }) => ({
        size,
        price: isEmpty(price) ? null : String(price),
      }));
    } else if (unassignedPrices.length > 0) {
      fields.default_price = unassignedPrices[0].price;
      fields.Size_Prices = [];
    } else {
      fields.default_price = first.fields.default_price ?? null;
      fields.Size_Prices = [];
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
}

export function groupArticleMatrixRows(rows: ParsedMasterWorkbookRow[]) {
  const grouped = groupArticleMatrixRowsWithErrors(rows);
  if (grouped.failures.length > 0) {
    throw new Error(grouped.failures[0].message);
  }
  return grouped.rows;
}
