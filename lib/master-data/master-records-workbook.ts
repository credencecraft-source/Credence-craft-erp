import * as XLSX from "xlsx";

import { normalizeUppercase } from "@/lib/utilities/text-case";
import type { MasterDefinition, MasterFieldDefinition } from "@/lib/master-data/master-data-models";

export const MAX_MASTER_WORKBOOK_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_MASTER_WORKBOOK_ROWS = 100_000;
const MAX_WORKBOOK_COLUMNS = 100;

export type ParsedMasterWorkbookRow = {
  rowNumber: number;
  code: string | null;
  description: string | null;
  fields: Record<string, unknown>;
  childRows: Record<string, Record<string, unknown>[] | string>;
};

export type MasterWorkbookParseFailure = {
  rowNumber: number;
  message: string;
  fieldPaths: string[];
  row: ParsedMasterWorkbookRow;
};

export type MasterWorkbookParseResult = {
  rows: ParsedMasterWorkbookRow[];
  failures: MasterWorkbookParseFailure[];
};

export type MasterRecordsImportResult = {
  created: number;
  failures: Array<{ rowNumber: number; message: string; row?: ParsedMasterWorkbookRow }>;
  validatedRowNumbers?: number[];
  fatalError?: string;
};

export function getRetryableMasterWorkbookRows(
  failures: MasterRecordsImportResult["failures"],
) {
  return failures.flatMap((failure) => failure.row
    ? [{ rowNumber: failure.rowNumber, message: failure.message, row: failure.row }]
    : []);
}

export type MasterWorkbookLookupOption = {
  id: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
};

export type MasterWorkbookLookupResolver = (
  moduleKey: string,
  value: string,
) => Promise<MasterWorkbookLookupOption[]>;

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function parseDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !dayFirst) return null;

  const year = Number(iso?.[1] ?? dayFirst?.[3]);
  const month = Number(iso?.[2] ?? dayFirst?.[2]);
  const day = Number(iso?.[3] ?? dayFirst?.[1]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseText(value: unknown, preserveCase = false) {
  const text = String(value ?? "").trim();
  return preserveCase ? text : normalizeUppercase(text);
}

function parseFieldValue(
  value: unknown,
  field: MasterFieldDefinition,
  rowNumber: number,
  articleVariantCell = false,
): unknown {
  if (field.type === "child-list") {
    const text = String(value ?? "").trim();
    if (!text) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (articleVariantCell) {
        const colorField = field.childFields?.find((childField) => childField.key === "color");
        if (!colorField) throw new Error("Article color variant fields are not configured.");
        return [{
          ...Object.fromEntries((field.childFields ?? []).map((childField) => [
            childField.key,
            childField.key === "color"
              ? parseFieldValue(text, childField, rowNumber)
              : null,
          ])),
        }];
      }
      throw new Error(`Row ${rowNumber}: ${field.label} must be a JSON array of child rows.`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Row ${rowNumber}: ${field.label} must be a JSON array of child rows.`);
    }

    return parsed.map((entry, childIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Row ${rowNumber}: ${field.label} child row ${childIndex + 1} must be an object.`);
      }
      const rawChild = entry as Record<string, unknown>;
      const childFields = field.childFields ?? [];
      const normalizedChild = Object.fromEntries(childFields.map((childField) => {
        const rawValue = rawChild[childField.key] ?? rawChild[childField.label];
        return [childField.key, parseFieldValue(rawValue, childField, rowNumber)];
      }));
      const hasData = Object.values(normalizedChild).some((childValue) =>
        Array.isArray(childValue) ? childValue.length > 0 : childValue !== null && childValue !== undefined && childValue !== "",
      );
      if (!hasData) return null;
      const missingRequired = childFields.find((childField) =>
        childField.required
        && (normalizedChild[childField.key] === null
          || normalizedChild[childField.key] === undefined
          || normalizedChild[childField.key] === ""),
      );
      if (missingRequired) {
        throw new Error(`Row ${rowNumber}: ${field.label} child row ${childIndex + 1} requires ${missingRequired.label}.`);
      }
      return normalizedChild;
    }).filter((child): child is Record<string, unknown> => child !== null);
  }

  if (field.multiple && field.type === "lookup") {
    const text = String(value ?? "").trim();
    return text ? text.split(/[;,]/).map((item) => normalizeUppercase(item.trim())).filter(Boolean) : [];
  }

  const text = String(value ?? "").trim();
  if (!text) {
    if (field.type === "checkbox") return false;
    if (field.multiple) return [];
    return null;
  }

  if (field.type === "checkbox") {
    if (/^(true|yes|1)$/i.test(text)) return true;
    if (/^(false|no|0)$/i.test(text)) return false;
    throw new Error(`Row ${rowNumber}: ${field.label} must be TRUE or FALSE.`);
  }
  if (field.type === "number" || field.type === "percentage" || field.type === "decimal") {
    const number = Number(text);
    if (!Number.isFinite(number)) {
      throw new Error(`Row ${rowNumber}: ${field.label} must be a valid number.`);
    }
    if (field.type === "percentage" && (number < 0 || number > 100)) {
      throw new Error(`Row ${rowNumber}: ${field.label} must be between 0 and 100.`);
    }
    return field.type === "decimal" ? text : number;
  }
  if (field.type === "date") {
    const date = parseDate(value);
    if (!date) throw new Error(`Row ${rowNumber}: ${field.label} must be a valid date (YYYY-MM-DD).`);
    return date;
  }
  if (field.type === "url" || field.type === "image") {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(text);
    } catch {
      throw new Error(`Row ${rowNumber}: ${field.label} must be an http or https URL.`);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`Row ${rowNumber}: ${field.label} must be an http or https URL.`);
    }
    return text;
  }
  if (field.type === "picklist" && field.options?.length
    && !field.options.some((option) => normalizeHeader(option) === normalizeHeader(text))) {
    throw new Error(`Row ${rowNumber}: ${field.label} must match one of its listed options.`);
  }

  return parseText(text);
}

function parseFieldValueForStaging(
  value: unknown,
  field: MasterFieldDefinition,
  articleVariantCell = false,
): unknown {
  const text = String(value ?? "").trim();
  if (!text) {
    if (field.type === "checkbox") return false;
    if (field.multiple) return [];
    return null;
  }
  if (field.type === "child-list") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (articleVariantCell) {
        const colorField = field.childFields?.find((childField) => childField.key === "color");
        return colorField
          ? [{ ...Object.fromEntries((field.childFields ?? []).map((childField) => [
              childField.key,
              childField.key === "color" ? parseText(text) : null,
            ])) }]
          : text;
      }
      return text;
    }
    if (!Array.isArray(parsed)) return text;
    return parsed.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const rawChild = entry as Record<string, unknown>;
      return [Object.fromEntries((field.childFields ?? []).map((childField) => [
        childField.key,
        parseFieldValueForStaging(rawChild[childField.key] ?? rawChild[childField.label], childField),
      ]))];
    });
  }
  if (field.multiple && field.type === "lookup") {
    return text.split(/[;,]/).map((item) => parseText(item)).filter(Boolean);
  }
  if (field.type === "checkbox") {
    if (/^(true|yes|1)$/i.test(text)) return true;
    if (/^(false|no|0)$/i.test(text)) return false;
    return text;
  }
  if (field.type === "number" || field.type === "percentage" || field.type === "decimal") {
    const number = Number(text);
    if (!Number.isFinite(number)) return text;
    return field.type === "decimal" ? text : number;
  }
  if (field.type === "date") return parseDate(value) ?? text;
  return parseText(text);
}

function isBlankRow(row: unknown[]) {
  return row.every((value) => String(value ?? "").trim() === "");
}

export async function parseMasterRecordsWorkbook(
  file: File,
  definition: MasterDefinition,
): Promise<ParsedMasterWorkbookRow[]>;
export async function parseMasterRecordsWorkbook(
  file: File,
  definition: MasterDefinition,
  collectRowErrors: true,
): Promise<MasterWorkbookParseResult>;
export async function parseMasterRecordsWorkbook(
  file: File,
  definition: MasterDefinition,
  mode: "stage",
): Promise<ParsedMasterWorkbookRow[]>;
export async function parseMasterRecordsWorkbook(
  file: File,
  definition: MasterDefinition,
  collectRowErrors: boolean | "stage" = false,
): Promise<ParsedMasterWorkbookRow[] | MasterWorkbookParseResult> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error("Choose an .xlsx workbook downloaded from this master.");
  }
  if (file.size === 0 || file.size > MAX_MASTER_WORKBOOK_SIZE_BYTES) {
    throw new Error("Excel workbooks must be between 1 byte and 50 MiB.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
      cellFormula: false,
    });
  } catch {
    throw new Error("The Excel workbook could not be read. Download a fresh template and try again.");
  }

  const dataSheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "data")
    ?? workbook.SheetNames[0];
  const worksheet = dataSheetName ? workbook.Sheets[dataSheetName] : undefined;
  if (!worksheet) throw new Error("The workbook is missing its data sheet.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headers = rows[0]?.map(normalizeHeader) ?? [];
  if (!headers.length) throw new Error("The workbook data sheet is empty.");
  if (headers.length > MAX_WORKBOOK_COLUMNS) {
    throw new Error(`A workbook may contain at most ${MAX_WORKBOOK_COLUMNS} columns.`);
  }

  const fields = definition.fields.filter((field) => !field.readOnly);
  const fieldByHeader = new Map<string, MasterFieldDefinition>();
  for (const field of fields) {
    for (const alias of [field.label, field.key]) {
      const normalized = normalizeHeader(alias);
      if (normalized && !fieldByHeader.has(normalized)) fieldByHeader.set(normalized, field);
    }
  }
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!header) return;
    if (headerIndexes.has(header)) {
      throw new Error(`The workbook contains a duplicate "${header}" column.`);
    }
    if (header !== "master code" && header !== "description" && !fieldByHeader.has(header)) {
      throw new Error(`The workbook contains an unknown column: "${String(rows[0]?.[index] ?? header)}".`);
    }
    headerIndexes.set(header, index);
  });

  const labelField = fields.find((field) => field.key === (definition.labelField ?? fields[0]?.key));
  if (!labelField || (
    !headerIndexes.has(normalizeHeader(labelField.label))
    && !headerIndexes.has(normalizeHeader(labelField.key))
  )) {
    throw new Error(`The workbook is missing its required "${labelField?.label ?? definition.label}" column.`);
  }
  const missingRequiredHeaders = fields
    .filter((field) => field.required
      && !headerIndexes.has(normalizeHeader(field.label))
      && !headerIndexes.has(normalizeHeader(field.key)))
    .map((field) => field.label);
  if (missingRequiredHeaders.length) {
    throw new Error(`The workbook is missing required columns: ${missingRequiredHeaders.join(", ")}.`);
  }

  const parsedRows: ParsedMasterWorkbookRow[] = [];
  const failures: MasterWorkbookParseFailure[] = [];
  let dataRowCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (isBlankRow(row)) continue;
    dataRowCount += 1;
    if (dataRowCount > MAX_MASTER_WORKBOOK_ROWS) {
      throw new Error(`A workbook may contain at most ${MAX_MASTER_WORKBOOK_ROWS} data rows.`);
    }

    const rowNumber = index + 1;
    const values: Record<string, unknown> = {};
    const childRows: Record<string, Record<string, unknown>[] | string> = {};
    if (collectRowErrors === "stage") {
      for (const field of fields) {
        const headerIndex = headerIndexes.get(normalizeHeader(field.label))
          ?? headerIndexes.get(normalizeHeader(field.key));
        const rawValue = headerIndex === undefined ? null : row[headerIndex];
        const parsedValue = parseFieldValueForStaging(
          rawValue,
          field,
          definition.key === "article" && field.key === "variants",
        );
        if (field.type === "child-list") {
          childRows[field.key] = parsedValue as Record<string, unknown>[] | string;
        } else {
          values[field.key] = parsedValue;
        }
      }
      const masterCodeIndex = headerIndexes.get("master code");
      const descriptionIndex = headerIndexes.get("description");
      parsedRows.push({
        rowNumber,
        code: masterCodeIndex === undefined ? null : parseText(row[masterCodeIndex]),
        description: descriptionIndex === undefined ? null : parseText(row[descriptionIndex]),
        fields: values,
        childRows,
      });
      continue;
    }
    let failureFieldPaths: string[] = [];
    try {
      for (const field of fields) {
        const headerIndex = headerIndexes.get(normalizeHeader(field.label))
          ?? headerIndexes.get(normalizeHeader(field.key));
        if (headerIndex === undefined) {
          values[field.key] = field.type === "checkbox" ? false : field.multiple ? [] : null;
          continue;
        }
        const rawValue = row[headerIndex];
        let parsedValue: unknown;
        try {
          parsedValue = parseFieldValue(
            rawValue,
            field,
            rowNumber,
            definition.key === "article" && field.key === "variants",
          );
        } catch (error) {
          failureFieldPaths = [field.key];
          throw error;
        }
        if (field.type === "child-list") {
          childRows[field.key] = parsedValue as Record<string, unknown>[];
        } else {
          values[field.key] = parsedValue;
        }
      }

      for (const field of fields) {
        if (!field.required || field.type === "child-list") continue;
        const value = values[field.key];
        const missing = Array.isArray(value) ? value.length === 0 : value === null || value === undefined || value === "";
        if (missing) {
          failureFieldPaths = [field.key];
          throw new Error(`Row ${rowNumber}: ${field.label} is required.`);
        }
      }
      for (const field of fields) {
        if (!field.dependsOn || field.type === "child-list"
          || definition.key === "article" && field.key === "Sizes") continue;
        const value = values[field.key];
        const hasValue = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
        const parent = values[field.dependsOn];
        const hasParent = Array.isArray(parent) ? parent.length > 0 : parent !== null && parent !== undefined && parent !== "";
        if (hasValue && !hasParent) {
          failureFieldPaths = [field.key];
          throw new Error(`Row ${rowNumber}: ${field.label} requires ${definition.fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? field.dependsOn}.`);
        }
        if (field.required && hasParent && !hasValue) {
          failureFieldPaths = [field.key];
          throw new Error(`Row ${rowNumber}: ${field.label} is required when ${definition.fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? field.dependsOn} is set.`);
        }
      }

      const label = String(values[labelField.key] ?? "").trim();
      if (!label) throw new Error(`Row ${rowNumber}: ${labelField.label} is required.`);
      const masterCodeIndex = headerIndexes.get("master code");
      const descriptionIndex = headerIndexes.get("description");
      parsedRows.push({
        rowNumber,
        code: masterCodeIndex === undefined ? null : parseText(row[masterCodeIndex]),
        description: descriptionIndex === undefined ? null : parseText(row[descriptionIndex]),
        fields: values,
        childRows,
      });
    } catch (error) {
      if (!collectRowErrors) throw error;
      const rawFields = Object.fromEntries(fields.map((field) => {
        const headerIndex = headerIndexes.get(normalizeHeader(field.label))
          ?? headerIndexes.get(normalizeHeader(field.key));
        const rawValue = headerIndex === undefined ? "" : row[headerIndex];
        return [field.key, field.type === "checkbox" ? String(rawValue ?? "") : String(rawValue ?? "").trim()];
      }));
      const childValues = Object.fromEntries(fields
        .filter((field) => field.type === "child-list")
        .map((field) => [field.key, rawFields[field.key]]));
      const message = error instanceof Error ? error.message : `Row ${rowNumber} is invalid.`;
      failures.push({
        rowNumber,
        message,
        fieldPaths: failureFieldPaths,
        row: {
          rowNumber,
          code: headerIndexes.has("master code") ? parseText(row[headerIndexes.get("master code")!]) : null,
          description: headerIndexes.has("description") ? parseText(row[headerIndexes.get("description")!]) : null,
          fields: Object.fromEntries(Object.entries(rawFields).filter(([key]) =>
            fields.find((field) => field.key === key)?.type !== "child-list",
          )),
          childRows: childValues,
        },
      });
    }
  }

  if (!parsedRows.length && !failures.length) throw new Error("The workbook has no data rows to import.");
  return collectRowErrors === true ? { rows: parsedRows, failures } : parsedRows;
}

export function validateCorrectedMasterWorkbookRows(
  value: unknown,
  definition: MasterDefinition,
): ParsedMasterWorkbookRow[] {
  if (!Array.isArray(value) || value.length > MAX_MASTER_WORKBOOK_ROWS) {
    throw new Error("Corrected workbook rows are invalid. Please upload the workbook again.");
  }
  const fields = definition.fields.filter((field) => !field.readOnly);
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Corrected workbook rows are invalid. Please upload the workbook again.");
    }
    const row = entry as Record<string, unknown>;
    if (
      !Number.isInteger(row.rowNumber) ||
      typeof row.fields !== "object" || row.fields === null || Array.isArray(row.fields) ||
      typeof row.childRows !== "object" || row.childRows === null || Array.isArray(row.childRows) ||
      (row.code !== null && typeof row.code !== "string") ||
      (row.description !== null && typeof row.description !== "string")
    ) {
      throw new Error("Corrected workbook rows are invalid. Please upload the workbook again.");
    }
    const rawFields = row.fields as Record<string, unknown>;
    const rawChildren = row.childRows as Record<string, unknown>;
    if (Object.keys(rawFields).some((key) => !fields.some((field) => field.key === key))
      || Object.keys(rawChildren).some((key) => !fields.some((field) => field.key === key && field.type === "child-list"))) {
      throw new Error("Corrected workbook rows contain unsupported fields.");
    }

    const parsedFields: Record<string, unknown> = {};
    const childRows: Record<string, Record<string, unknown>[]> = {};
    for (const field of fields) {
      if (field.type === "child-list") {
        const children = rawChildren[field.key] ?? [];
        const childInput = typeof children === "string" ? children : JSON.stringify(children);
        const parsed = parseFieldValue(childInput, field, Number(row.rowNumber));
        childRows[field.key] = parsed as Record<string, unknown>[];
        continue;
      }
      const rawValue = rawFields[field.key];
      const displayValue = Array.isArray(rawValue) ? rawValue.join(";") : rawValue === null || rawValue === undefined ? "" : String(rawValue);
      parsedFields[field.key] = parseFieldValue(displayValue, field, Number(row.rowNumber));
    }
    for (const field of fields) {
      if (field.type === "child-list") continue;
      const value = parsedFields[field.key];
      const hasValue = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
      if (field.required && !hasValue) throw new Error(`Row ${row.rowNumber}: ${field.label} is required.`);
      if (field.dependsOn) {
        const parent = parsedFields[field.dependsOn];
        const hasParent = Array.isArray(parent) ? parent.length > 0 : parent !== null && parent !== undefined && parent !== "";
        if (hasValue && !hasParent) {
          const parentLabel = fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? field.dependsOn;
          throw new Error(`Row ${row.rowNumber}: ${field.label} requires ${parentLabel}.`);
        }
        if (field.required && hasParent && !hasValue) {
          const parentLabel = fields.find((candidate) => candidate.key === field.dependsOn)?.label ?? field.dependsOn;
          throw new Error(`Row ${row.rowNumber}: ${field.label} is required when ${parentLabel} is set.`);
        }
      }
    }
    const labelField = fields.find((field) => field.key === (definition.labelField ?? fields[0]?.key));
    if (!labelField || !String(parsedFields[labelField.key] ?? "").trim()) {
      throw new Error(`Row ${row.rowNumber}: ${labelField?.label ?? definition.label} is required.`);
    }
    return {
      rowNumber: Number(row.rowNumber),
      code: row.code as string | null,
      description: row.description as string | null,
      fields: parsedFields,
      childRows,
    };
  });
}

export async function validateMasterWorkbookLookupValues(
  definition: MasterDefinition,
  rows: ParsedMasterWorkbookRow[],
  resolveLookup: MasterWorkbookLookupResolver,
) {
  const validateFields = async (
    rowNumber: number,
    fields: MasterFieldDefinition[],
    values: Record<string, unknown>,
  ) => {
    for (const field of fields) {
      if (field.type === "child-list") {
        if (definition.key === "article" && field.key === "variants") continue;
        const children = Array.isArray(values[field.key]) ? values[field.key] as Record<string, unknown>[] : [];
        for (const child of children) {
          await validateFields(rowNumber, field.childFields ?? [], child);
        }
        continue;
      }
      if (field.type !== "lookup" || !field.lookupModuleKey) continue;
      if (definition.key === "article"
        && ["Brand", "Product_Master", "Category", "Subcategory", "Size_Group", "Sizes"].includes(field.key)) {
        continue;
      }

      const rawValue = values[field.key];
      const selectedValues = Array.isArray(rawValue)
        ? rawValue
        : rawValue === null || rawValue === undefined || rawValue === "" ? [] : [rawValue];
      const dependencyKey = field.dependsOn;
      const parentField = dependencyKey
        ? fields.find((candidate) => candidate.key === dependencyKey)
        : undefined;
      const parentLookupModuleKey = parentField?.type === "lookup" ? parentField.lookupModuleKey : undefined;
      let parentOptions: MasterWorkbookLookupOption[] = [];
      if (parentField?.type === "lookup" && parentLookupModuleKey && dependencyKey) {
        const rawParent = values[dependencyKey];
        const parentValues = Array.isArray(rawParent)
          ? rawParent
          : rawParent === null || rawParent === undefined || rawParent === "" ? [] : [rawParent];
        parentOptions = (await Promise.all(parentValues.map((value) =>
          resolveLookup(parentLookupModuleKey, String(value)),
        ))).flat();
      }

      const selectedOptions: MasterWorkbookLookupOption[] = [];
      for (const selectedValue of selectedValues) {
        let matches = await resolveLookup(field.lookupModuleKey, String(selectedValue));
        if (!matches.length) {
          throw new Error(`Row ${rowNumber}: "${String(selectedValue)}" is not an active ${field.label} value in this organization.`);
        }
        if (parentField?.type === "lookup") {
          matches = matches.filter((option) => parentOptions.some((parent) => parent.id === option.parent_id));
          if (!matches.length) {
            throw new Error(`Row ${rowNumber}: ${field.label} must belong to the selected ${parentField.label}.`);
          }
        }
        if (matches.length > 1) {
          throw new Error(`Row ${rowNumber}: "${String(selectedValue)}" matches more than one ${field.label} value. Use a unique value.`);
        }
        selectedOptions.push(matches[0]);
      }

      values[field.key] = field.multiple
        ? selectedOptions.map((option) => option.id)
        : selectedOptions[0]?.id ?? null;
    }
  };

  for (const row of rows) {
    const values = { ...row.fields, ...row.childRows };
    await validateFields(row.rowNumber, definition.fields, values);
    row.fields = Object.fromEntries(Object.entries(values).filter(([key]) =>
      definition.fields.find((field) => field.key === key)?.type !== "child-list",
    ));
    for (const field of definition.fields) {
      if (field.type === "child-list" && Array.isArray(values[field.key])) {
        row.childRows[field.key] = values[field.key] as Record<string, unknown>[];
      }
    }
  }
}
