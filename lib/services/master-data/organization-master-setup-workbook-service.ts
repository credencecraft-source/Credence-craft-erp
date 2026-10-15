import XlsxPopulate from "xlsx-populate";

import {
  getActiveOrganizationDummyDataBatch,
  getMasterValuesForOrganization,
} from "@/lib/master-data/master-data-constants";
import {
  getOrganizationMasterSetupWorkbookDefinitions,
  getOrganizationMasterSetupFields,
  getOrganizationMasterSetupSheetName,
  ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN,
  type OrganizationMasterSetupStage,
} from "@/lib/master-data/organization-master-setup-stages";

const MAX_WORKBOOK_ROWS = 500;
const LOOKUP_SHEET_NAME = "Lookup Values";
const INSTRUCTIONS_SHEET_NAME = "Instructions";

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

function lookupName(moduleKey: string) {
  return `SetupLookup_${moduleKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export async function createOrganizationMasterSetupWorkbook(
  organizationId: string,
  stage: OrganizationMasterSetupStage,
) {
  const definitions = getOrganizationMasterSetupWorkbookDefinitions(stage);
  if (!definitions.length) {
    throw new Error("No masters are available for this setup step.");
  }

  const lookupKeys = [...new Set(definitions.flatMap((definition) =>
    getOrganizationMasterSetupFields(definition)
      .filter((field) => field.type === "lookup" && field.lookupModuleKey)
      .map((field) => field.lookupModuleKey),
  ))];
  const lookupOptions: Record<string, Array<{ id: string; label: string }>> = {};
  const activeDummyDataBatch = getActiveOrganizationDummyDataBatch(organizationId);
  await Promise.all(lookupKeys.map(async (key) => {
    lookupOptions[key] = await getMasterValuesForOrganization(
      organizationId,
      key,
      false,
      { limit: 500, activeDummyDataBatch },
    );
  }));

  const workbook = await XlsxPopulate.fromBlankAsync();
  const instructions = workbook.sheet(0).name(INSTRUCTIONS_SHEET_NAME);
  instructions.cell("A1").value("Organization Master Setup Workbook");
  instructions.cell("A1").style({ bold: true });
  instructions.cell("A3").value("Step");
  instructions.cell("B3").value(stage === "independent" ? "1 - Onboarding" : stage === "related" ? "2 - Related Masters" : "3 - Production Masters");
  instructions.cell("A4").value("How to use");
  instructions.cell("B4").value("Enter one master record per row on its named sheet. On Finished Goods Category and Raw Material Category sheets, enter one or more comma-separated subcategories in the Subcategories column to create them with their category.");
  instructions.cell("A5").value("Related values");
  instructions.cell("B5").value("Lookup columns contain active values already saved for this organization. Complete and save the earlier step, then download a fresh template to refresh its dropdowns.");
  instructions.cell("A6").value("Multiple selections");
  instructions.cell("B6").value("For a field that accepts multiple lookups, select a value from its dropdown or enter values separated by commas.");
  instructions.column("A").width(24);
  instructions.column("B").width(100);

  const lookupSheet = workbook.addSheet(LOOKUP_SHEET_NAME);
  const lookupColumns = new Map<string, string>();
  lookupKeys.forEach((key, index) => {
    const column = columnName(index + 1);
    lookupColumns.set(key, column);
    lookupSheet.cell(`${column}1`).value(key);
    const values = [...new Set((lookupOptions[key] ?? []).map((option) => option.label.trim()).filter(Boolean))];
    if (!values.length) return;
    lookupSheet.range(`${column}2:${column}${values.length + 1}`).value(values.map((value) => [value]));
    workbook.definedName(
      lookupName(key),
      lookupSheet.range(`${column}2:${column}${values.length + 1}`),
    );
  });
  lookupSheet.hidden(true);

  definitions.forEach((definition, definitionIndex) => {
    const sheet = workbook.addSheet(
      getOrganizationMasterSetupSheetName(definitionIndex, definition.label),
    );
    const fields = getOrganizationMasterSetupFields(definition)
      .filter((field) => !field.readOnly);
    const inlineChildren = ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN[
      definition.key as keyof typeof ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN
    ];
    const headers = [
      ...fields.map((field) => field.label),
      ...(inlineChildren ? [inlineChildren.columnLabel] : []),
    ];
    const lastColumn = columnName(headers.length);
    sheet.range(`A1:${lastColumn}1`).value([headers]);
    sheet.range(`A1:${lastColumn}1`).style({ bold: true, fill: "E2F3EC" });
    sheet.freezePanes(1, 0);
    headers.forEach((header, index) => {
      sheet.column(columnName(index + 1)).width(Math.min(Math.max(header.length + 4, 20), 38));
    });

    fields.forEach((field, fieldIndex) => {
      if (field.type !== "lookup" || !field.lookupModuleKey) return;
      const column = columnName(fieldIndex + 1);
      if (!lookupColumns.has(field.lookupModuleKey) || !(lookupOptions[field.lookupModuleKey] ?? []).length) {
        return;
      }
      sheet.range(`${column}2:${column}${MAX_WORKBOOK_ROWS + 1}`).dataValidation({
        type: "list",
        allowBlank: !field.required,
        showErrorMessage: !field.multiple,
        errorTitle: `${field.label} must be a saved master`,
        error: "Choose a value from this organization's active master list. Save its earlier step first if the list is empty.",
        formula1: lookupName(field.lookupModuleKey),
      });
    });
  });

  return workbook.outputAsync({ type: "nodebuffer" });
}
