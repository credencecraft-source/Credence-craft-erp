import type { OrganizationMasterSetupField } from "@/lib/master-data/organization-master-setup-stages";
import { getOrganizationMasterSetupSheetName } from "@/lib/master-data/organization-master-setup-stages";

type Definition = {
  key: string;
  label: string;
  fields: OrganizationMasterSetupField[];
  labelField?: string;
};

type LookupOption = { id: string; label: string };
type SetupRecord = {
  moduleKey: string;
  label: string;
  fields: Record<string, string | number | boolean | null | string[]>;
};

const MAX_WORKBOOK_ROWS = 500;
const MAX_TOTAL_WORKBOOK_ROWS = 2000;
const MAX_WORKBOOK_SIZE_BYTES = 10 * 1024 * 1024;

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function splitMultipleValues(value: string) {
  return value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
}

function parseDateValue(value: unknown) {
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
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseFieldValue(
  rawValue: unknown,
  field: OrganizationMasterSetupField,
  lookupOptions: Record<string, LookupOption[]>,
  rowNumber: number,
) {
  const text = String(rawValue ?? "").trim();
  if (field.type === "lookup") {
    const labels = field.multiple && text ? splitMultipleValues(text) : text ? [text] : [];
    const options = lookupOptions[field.lookupModuleKey] ?? [];
    const selected = labels.map((label) => {
      const option = options.find((item) => normalizeHeader(item.label) === normalizeHeader(label));
      if (!option) {
        throw new Error(
          `Row ${rowNumber}: "${label}" is not an active ${field.label} value. Save the required earlier-step master, then download a fresh template.`,
        );
      }
      return option.id;
    });
    return field.multiple ? selected : selected[0] ?? "";
  }

  if (field.type === "number" || field.type === "percentage" || field.type === "decimal") {
    if (!text) return "";
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`Row ${rowNumber}: ${field.label} must be a non-negative number.`);
    }
    return number;
  }
  if (field.type === "checkbox") {
    if (!text) return false;
    if (/^(true|yes|1)$/i.test(text)) return true;
    if (/^(false|no|0)$/i.test(text)) return false;
    throw new Error(`Row ${rowNumber}: ${field.label} must be TRUE or FALSE.`);
  }
  if (field.type === "date" && text) {
    const date = parseDateValue(rawValue);
    if (!date) {
      throw new Error(`Row ${rowNumber}: ${field.label} must be a valid date (YYYY-MM-DD).`);
    }
    return date;
  }
  if (field.type === "picklist" && text && field.options?.length
    && !field.options.some((option) => normalizeHeader(option) === normalizeHeader(text))) {
    throw new Error(`Row ${rowNumber}: ${field.label} must match one of its listed options.`);
  }
  return text;
}

export async function parseOrganizationMasterSetupWorkbook(
  file: File,
  definitions: Definition[],
  lookupOptions: Record<string, LookupOption[]>,
): Promise<SetupRecord[]> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error("Choose an .xlsx workbook downloaded for this setup step.");
  }
  if (file.size > MAX_WORKBOOK_SIZE_BYTES) {
    throw new Error("Excel workbooks must be 10 MB or smaller.");
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    cellFormula: false,
  });
  const records: SetupRecord[] = [];

  for (const [definitionIndex, definition] of definitions.entries()) {
    const templateSheetName = getOrganizationMasterSetupSheetName(definitionIndex, definition.label);
    const sheetName = workbook.Sheets[templateSheetName]
      ? templateSheetName
      : workbook.SheetNames.find((name) => {
          const label = name.replace(/^\d+\s*-\s*/, "");
          return normalizeHeader(name) === normalizeHeader(definition.label)
            || normalizeHeader(label) === normalizeHeader(definition.label);
        });
    const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const headers = rows[0]?.map(normalizeHeader) ?? [];
    const fields = definition.fields.filter((field) => !field.readOnly);
    const fieldIndexes = new Map<string, number>();
    headers.forEach((header, index) => {
      if (header && !fieldIndexes.has(header)) fieldIndexes.set(header, index);
    });
    const labelFieldKey = definition.labelField ?? fields[0]?.key;
    const labelField = fields.find((field) => field.key === labelFieldKey);
    if (!labelField || !fieldIndexes.has(normalizeHeader(labelField.label))) {
      throw new Error(`The "${definition.label}" sheet is missing its required "${labelField?.label ?? definition.label}" column.`);
    }
    const missingRequiredHeaders = fields
      .filter((field) => field.required && !fieldIndexes.has(normalizeHeader(field.label)))
      .map((field) => field.label);
    if (missingRequiredHeaders.length) {
      throw new Error(`The "${definition.label}" sheet is missing required columns: ${missingRequiredHeaders.join(", ")}.`);
    }

    let sheetRecordCount = 0;
    for (const [rowIndex, row] of rows.slice(1).entries()) {
      if (row.every((cell) => String(cell ?? "").trim() === "")) continue;
      sheetRecordCount += 1;
      if (sheetRecordCount > MAX_WORKBOOK_ROWS) {
        throw new Error(`The "${definition.label}" sheet cannot contain more than ${MAX_WORKBOOK_ROWS} records.`);
      }
      const spreadsheetRow = rowIndex + 2;
      const label = String(row[fieldIndexes.get(normalizeHeader(labelField.label))!] ?? "").trim();
      if (!label) {
        throw new Error(`"${definition.label}" sheet, row ${spreadsheetRow}: ${labelField.label} is required.`);
      }

      const values: SetupRecord["fields"] = {};
      for (const field of fields) {
        const fieldIndex = fieldIndexes.get(normalizeHeader(field.label));
        const rawValue = fieldIndex === undefined ? "" : row[fieldIndex];
        const value = parseFieldValue(rawValue, field, lookupOptions, spreadsheetRow);
        if (field.required && (value === "" || (Array.isArray(value) && value.length === 0))) {
          throw new Error(`"${definition.label}" sheet, row ${spreadsheetRow}: ${field.label} is required.`);
        }
        if (field.key !== labelFieldKey && value !== "") {
          values[field.key] = value;
        }
      }
      records.push({ moduleKey: definition.key, label, fields: values });
      if (records.length > MAX_TOTAL_WORKBOOK_ROWS) {
        throw new Error(`A workbook upload cannot contain more than ${MAX_TOTAL_WORKBOOK_ROWS} records in total.`);
      }
    }
  }

  if (!records.length) {
    throw new Error("No master records were found. Add values to the workbook sheets before uploading.");
  }
  return records;
}
