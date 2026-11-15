import XlsxPopulate, { type Sheet, type Workbook } from "xlsx-populate";

import type { MasterFieldDefinition } from "@/lib/master-data/master-data-models";

const TEMPLATE_ROWS = 500;

export type MasterWorkbookLookupOption = {
  id: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
};

export type MasterWorkbookRecord = {
  id: string;
  code: string | null;
  description: string | null;
  metadata?: unknown;
};

export type MasterWorkbookChildRecord = {
  parentId: string | null;
  label: string;
  fields?: Record<string, unknown>;
};

type CreateMasterRecordsWorkbookInput = {
  records: MasterWorkbookRecord[];
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>;
  childRecords: MasterWorkbookChildRecord[];
  moduleLabel: string;
};

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function recordFields(record: MasterWorkbookRecord) {
  if (!record.metadata || typeof record.metadata !== "object") return {};
  const metadata = record.metadata as Record<string, unknown>;
  return metadata.fields && typeof metadata.fields === "object"
    ? metadata.fields as Record<string, unknown>
    : {};
}

function optionLabel(value: unknown, options: MasterWorkbookLookupOption[] = []) {
  const key = String(value ?? "");
  const match = options.find((option) =>
    [option.id, option.value_id, option.label].some((candidate) =>
      candidate !== undefined && String(candidate).toLocaleLowerCase() === key.toLocaleLowerCase(),
    ),
  );
  return match?.label ?? key;
}

function exportFieldValue(
  field: MasterFieldDefinition,
  value: unknown,
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>,
  children: MasterWorkbookChildRecord[],
) {
  if (field.type === "image" && typeof value === "string" && value.startsWith("data:")) return "";
  if (field.type === "child-list") {
    return JSON.stringify(children.map((child) => Object.fromEntries(
      (field.childFields ?? []).map((childField) => [
        childField.label,
        childField.type === "lookup"
          ? optionLabel(child.fields?.[childField.key], lookupOptions[childField.lookupModuleKey ?? ""])
          : child.fields?.[childField.key] ?? "",
      ]),
    )));
  }

  const normalizedValue = value === null || value === undefined || value === ""
    ? field.multiple && children.length ? children.map((child) => child.label) : value
    : value;
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === "") return "";
  if (field.type === "lookup" && field.lookupModuleKey) {
    const options = lookupOptions[field.lookupModuleKey] ?? [];
    return Array.isArray(normalizedValue)
      ? normalizedValue.map((item) => optionLabel(item, options)).join("; ")
      : optionLabel(normalizedValue, options);
  }
  if (Array.isArray(normalizedValue)) return normalizedValue.join("; ");
  if (typeof normalizedValue === "object") return JSON.stringify(normalizedValue);
  return normalizedValue;
}

function writeList(
  sheet: Sheet,
  column: string,
  heading: string,
  values: string[],
) {
  sheet.cell(`${column}1`).value(heading);
  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (uniqueValues.length) {
    sheet.range(`${column}2:${column}${uniqueValues.length + 1}`).value(uniqueValues.map((value) => [value]));
  }
  return uniqueValues;
}

function addListValidation(sheet: Sheet, column: string, lastRow: number, formula: string) {
  sheet.range(`${column}2:${column}${lastRow}`).dataValidation({
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formula1: formula,
  });
}

function lookupValues(
  field: MasterFieldDefinition,
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>,
) {
  return field.lookupModuleKey
    ? lookupOptions[field.lookupModuleKey] ?? []
    : [];
}

function addFieldValidation(
  workbook: Workbook,
  dataSheet: Sheet,
  lookupsSheet: Sheet,
  field: MasterFieldDefinition,
  fields: MasterFieldDefinition[],
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>,
  column: string,
  fieldIndex: number,
  lastRow: number,
  lookupColumnIndex: number,
) {
  if (field.type === "picklist" && field.options?.length) {
    const listColumn = columnName(lookupColumnIndex);
    const values = writeList(lookupsSheet, listColumn, field.label, field.options);
    if (values.length) {
      const name = `MasterPicklist${fieldIndex + 1}`;
      workbook.definedName(name, lookupsSheet.range(`${listColumn}2:${listColumn}${values.length + 1}`));
      addListValidation(dataSheet, column, lastRow, name);
    }
    return;
  }

  if (field.type !== "lookup" || !field.lookupModuleKey) return;

  const childOptions = lookupValues(field, lookupOptions);
  if (!childOptions.length) return;
  const parentField = field.dependsOn
    ? fields.find((candidate) => candidate.key === field.dependsOn && candidate.type === "lookup")
    : undefined;
  const parentOptions = parentField ? lookupValues(parentField, lookupOptions) : [];
  const hasUniqueParentLabels = parentOptions.length > 0
    && new Set(parentOptions.map((option) => option.label.toLocaleLowerCase())).size === parentOptions.length;
  const hasParentRelations = hasUniqueParentLabels
    && parentOptions.some((parent) => childOptions.some((option) =>
      option.parent_id === parent.id || (parent.value_id && option.parent_id === parent.value_id),
    ));

  if (parentField && hasParentRelations) {
    const parentIndex = fields.indexOf(parentField);
    const parentColumn = columnName(parentIndex + 1);
    const listColumn = columnName(lookupColumnIndex);
    const parentValues = writeList(
      lookupsSheet,
      listColumn,
      `${field.label} parent`,
      parentOptions.map((option) => option.label),
    );
    const parentRangeName = `MasterLookupParent${fieldIndex + 1}`;
    workbook.definedName(
      parentRangeName,
      lookupsSheet.range(`${listColumn}2:${listColumn}${parentValues.length + 1}`),
    );

    parentOptions.forEach((parent, parentOptionIndex) => {
      const values = childOptions
        .filter((option) => option.parent_id === parent.id || (parent.value_id && option.parent_id === parent.value_id))
        .map((option) => option.label);
      const valuesColumn = columnName(lookupColumnIndex + 1 + parentOptionIndex);
      const childLabels = writeList(lookupsSheet, valuesColumn, `${field.label} ${parent.label}`, values);
      if (childLabels.length) {
        const listName = `MasterLookup${fieldIndex + 1}Parent${parentOptionIndex + 1}`;
        workbook.definedName(
          listName,
          lookupsSheet.range(`${valuesColumn}2:${valuesColumn}${childLabels.length + 1}`),
        );
      } else {
        lookupsSheet.cell(`${valuesColumn}2`).value("");
        const listName = `MasterLookup${fieldIndex + 1}Parent${parentOptionIndex + 1}`;
        workbook.definedName(listName, lookupsSheet.range(`${valuesColumn}2:${valuesColumn}2`));
      }
    });

    addListValidation(
      dataSheet,
      column,
      lastRow,
      `INDIRECT("MasterLookup${fieldIndex + 1}Parent"&MATCH($${parentColumn}2,${parentRangeName},0))`,
    );
    return;
  }

  const listColumn = columnName(lookupColumnIndex);
  const values = writeList(
    lookupsSheet,
    listColumn,
    field.label,
    childOptions.map((option) => option.label),
  );
  if (!values.length) return;
  const name = `MasterLookup${fieldIndex + 1}`;
  workbook.definedName(name, lookupsSheet.range(`${listColumn}2:${listColumn}${values.length + 1}`));
  addListValidation(dataSheet, column, lastRow, name);
}

export async function createMasterRecordsTemplateWorkbook({
  records,
  fields,
  lookupOptions,
  childRecords,
  moduleLabel,
}: CreateMasterRecordsWorkbookInput) {
  const exportFields = fields.filter((field) => !field.readOnly);
  const headers = [...exportFields.map((field) => field.label), "Master Code", "Description"];
  const lastDataRow = Math.max(TEMPLATE_ROWS + 1, records.length + 1);
  const workbook = await XlsxPopulate.fromBlankAsync();
  const dataSheet = workbook.sheet(0).name("Data");
  const lookupsSheet = workbook.addSheet("Lookups");
  const instructions = workbook.addSheet("Instructions");

  dataSheet.range(`A1:${columnName(headers.length)}1`).value([headers]);
  dataSheet.range(`A1:${columnName(headers.length)}1`).style({ bold: true });
  dataSheet.freezePanes(1, 0);

  records.forEach((record, recordIndex) => {
    const values = recordFields(record);
    const relatedChildren = childRecords.filter((child) => child.parentId === record.id);
    const row = [
      ...exportFields.map((field) => exportFieldValue(field, values[field.key], lookupOptions, relatedChildren)),
      record.code ?? "",
      record.description ?? "",
    ];
    dataSheet.range(`A${recordIndex + 2}:${columnName(headers.length)}${recordIndex + 2}`).value([row]);
  });

  let lookupColumnIndex = exportFields.length + 3;
  exportFields.forEach((field, fieldIndex) => {
    const parentField = field.dependsOn
      ? exportFields.find((candidate) => candidate.key === field.dependsOn && candidate.type === "lookup")
      : undefined;
    const reservedColumns = parentField
      ? Math.max(1, (lookupOptions[parentField.lookupModuleKey ?? ""] ?? []).length + 1)
      : 1;
    addFieldValidation(
      workbook,
      dataSheet,
      lookupsSheet,
      field,
      exportFields,
      lookupOptions,
      columnName(fieldIndex + 1),
      fieldIndex,
      lastDataRow,
      lookupColumnIndex,
    );
    lookupColumnIndex += reservedColumns;
    dataSheet.column(columnName(fieldIndex + 1)).width(Math.max(18, field.label.length + 3));
  });
  dataSheet.column(columnName(headers.length - 1)).width(20);
  dataSheet.column(columnName(headers.length)).width(30);

  instructions.range("A1:A8").value([
    [`${moduleLabel} Master Data Import Instructions`],
    ["Use the Data sheet and keep its header names unchanged."],
    ["Imports create new records only. Existing matching records are not overwritten."],
    ["Each row saves independently. Review the import result for rejected rows."],
    ["For child-list columns, provide a JSON array of objects using the child field labels as keys."],
    ["Lookup choices are available as dropdowns; dependent lookup dropdowns follow the selected parent when configured."],
    ["For multiple lookup values, choose one value and separate additional values with semicolons."],
    ["Text values are normalized to uppercase when saved."],
  ]);
  lookupsSheet.hidden(true);
  lookupsSheet.freezePanes(1, 0);

  return workbook.outputAsync({ type: "arraybuffer" });
}
