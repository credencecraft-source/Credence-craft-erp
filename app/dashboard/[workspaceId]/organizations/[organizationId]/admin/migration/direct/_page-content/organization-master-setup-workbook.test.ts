import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";

const { getActiveOrganizationDummyDataBatchMock, getMasterValuesMock } = vi.hoisted(() => ({
  getActiveOrganizationDummyDataBatchMock: vi.fn().mockResolvedValue(null),
  getMasterValuesMock: vi.fn(),
}));

vi.mock("@/lib/master-data/master-data-constants", () => ({
  getActiveOrganizationDummyDataBatch: getActiveOrganizationDummyDataBatchMock,
  getMasterValuesForOrganization: getMasterValuesMock,
}));

import {
  createOrganizationMasterSetupUploadLookupReference,
  getOrganizationMasterSetupDefinitions,
  getOrganizationMasterSetupFields,
  getOrganizationMasterSetupSheetName,
  getOrganizationMasterSetupWorkbookDefinitions,
  ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN,
} from "@/lib/master-data/organization-master-setup-stages";
import { createOrganizationMasterSetupWorkbook } from "@/lib/services/master-data/organization-master-setup-workbook-service";
import {
  parseOrganizationMasterSetupWorkbook,
  validateOrganizationMasterSetupWorkbookCorrection,
} from "./organization-master-setup-workbook";

describe("organization master setup Excel workbooks", () => {
  it("places lookup parents before dependent categories and subcategories", () => {
    const independent = getOrganizationMasterSetupDefinitions("independent").map((definition) => definition.key);
    const related = getOrganizationMasterSetupDefinitions("related").map((definition) => definition.key);
    const production = getOrganizationMasterSetupDefinitions("third").map((definition) => definition.key);

    expect(independent).toContain("product-master");
    expect(related).toContain("category");
    expect(related).toContain("sub-category");
    expect(related).toContain("raw-material-sub-category");
    expect(production).not.toContain("sub-category");
    expect(getOrganizationMasterSetupFields(
      getOrganizationMasterSetupDefinitions("related").find((definition) => definition.key === "category")!,
    ).find((field) => field.key === "Product_Master")).toMatchObject({
      required: true,
      lookupModuleKey: "product-master",
    });
    expect(getOrganizationMasterSetupFields(
      getOrganizationMasterSetupDefinitions("related").find((definition) => definition.key === "sub-category")!,
    ).find((field) => field.key === "category")).toMatchObject({
      required: true,
      lookupModuleKey: "category",
    });
  });

  it("creates one related-step workbook with a sheet per section and existing lookup values", async () => {
    getMasterValuesMock.mockImplementation(async (_organizationId: string, moduleKey: string) =>
      moduleKey === "product-master" ? [{ id: "finished-goods-id", label: "Finished Goods" }] : [],
    );

    const buffer = await createOrganizationMasterSetupWorkbook("org-id", "related");
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const definitions = getOrganizationMasterSetupWorkbookDefinitions("related");
    const categoryDefinitionIndex = definitions.findIndex((definition) => definition.key === "category");
    const categorySheetName = getOrganizationMasterSetupSheetName(categoryDefinitionIndex, "Finished Goods Category");
    const categoryRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[categorySheetName], {
      header: 1,
      defval: "",
    });

    expect(workbook.SheetNames[0]).toBe("Instructions");
    expect(workbook.SheetNames).toContain(categorySheetName);
    expect(workbook.SheetNames).toContain("Lookup Values");
    expect(categoryRows[0]).toEqual([
      "Finished Goods Type",
      "Finished Goods Category Name",
      "Subcategories (comma-separated)",
    ]);
    expect(workbook.SheetNames).not.toContain("Sub Category");
    const rawCategoryIndex = definitions.findIndex((definition) => definition.key === "raw-material-category");
    const rawCategorySheetName = getOrganizationMasterSetupSheetName(rawCategoryIndex, "Raw Material Category");
    const rawCategoryRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[rawCategorySheetName], {
      header: 1,
      defval: "",
    });
    expect(rawCategoryRows[0]).toContain("Subcategories (comma-separated)");
    expect(workbook.SheetNames).not.toContain("Raw Material Sub Category");
    expect(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Lookup Values"], { header: 1 })[1]).toContain("Finished Goods");

    const populatedWorkbook = await XlsxPopulate.fromDataAsync(new Uint8Array(buffer));
    expect(populatedWorkbook.sheet("Lookup Values").hidden()).toBe(true);
    expect(populatedWorkbook.sheet(categorySheetName).range("A2:A501").dataValidation()).toMatchObject({
      type: "list",
      formula1: "SetupLookup_product_master",
    });
  });

  it("parses a category worksheet and maps its selected Finished Goods Type to its organization lookup id", async () => {
    const definitions = getOrganizationMasterSetupDefinitions("related").map((definition) => ({
      key: definition.key,
      label: definition.label,
      labelField: definition.labelField,
      fields: getOrganizationMasterSetupFields(definition),
    }));
    const workbook = XLSX.utils.book_new();
    for (const [index, definition] of definitions.entries()) {
      const fields = definition.fields.filter((field) => !field.readOnly);
      const rows: unknown[][] = [fields.map((field) => field.label)];
      if (definition.key === "category") {
        rows.push(["Finished Goods", "Shirt"]);
      }
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(rows),
        getOrganizationMasterSetupSheetName(index, definition.label),
      );
    }
    const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = Object.assign(new Blob([data]), { name: "related-step.xlsx" }) as File;

    const records = await parseOrganizationMasterSetupWorkbook(file, definitions, {
      "product-master": [{ id: "finished-goods-id", label: "Finished Goods" }],
    });

    expect(records).toContainEqual({
      moduleKey: "category",
      label: "Shirt",
      fields: { Product_Master: "finished-goods-id" },
    });
  });

  it("keeps valid setup rows and allows invalid lookup rows to be corrected and revalidated", async () => {
      const definitions = getOrganizationMasterSetupDefinitions("related").map((definition) => ({
        key: definition.key,
        label: definition.label,
        labelField: definition.labelField,
        fields: getOrganizationMasterSetupFields(definition),
      }));
      const categoryDefinition = definitions.find((definition) => definition.key === "category")!;
      const workbook = XLSX.utils.book_new();
      const categoryFields = categoryDefinition.fields.filter((field) => !field.readOnly);
      const rows = [
        categoryFields.map((field) => field.label),
        ["Finished Goods", "Shirt"],
        ["Unknown Type", "Tops"],
      ];
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(rows),
        getOrganizationMasterSetupSheetName(definitions.indexOf(categoryDefinition), categoryDefinition.label),
      );
      const file = Object.assign(
        new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })]),
        { name: "related-step.xlsx" },
      ) as File;
      const lookups = { "product-master": [{ id: "finished-goods-id", label: "Finished Goods" }] };

      const parsed = await parseOrganizationMasterSetupWorkbook(file, definitions, lookups, true);
      expect(parsed.records).toContainEqual({
        moduleKey: "category",
        label: "Shirt",
        fields: { Product_Master: "finished-goods-id" },
      });
      expect(parsed.corrections).toHaveLength(1);
      expect(parsed.corrections[0].values.Product_Master).toBe("Unknown Type");

      parsed.corrections[0].values.Product_Master = "Finished Goods";
      expect(validateOrganizationMasterSetupWorkbookCorrection(
        parsed.corrections[0],
        categoryDefinition,
        lookups,
      )).toEqual([{
        moduleKey: "category",
        label: "Tops",
        fields: { Product_Master: "finished-goods-id" },
      }]);
  });

  it("parses finished-goods and raw-material subcategories from their category rows", async () => {
    const definitions = getOrganizationMasterSetupDefinitions("related").map((definition) => ({
      key: definition.key,
      label: definition.label,
      labelField: definition.labelField,
      fields: getOrganizationMasterSetupFields(definition),
    }));
    const workbook = XLSX.utils.book_new();
    for (const definition of definitions) {
      const relation = ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN[
        definition.key as keyof typeof ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN
      ];
      if (!relation) continue;
      const fields = definition.fields.filter((field) => !field.readOnly);
      const rows: unknown[][] = [[
        ...fields.map((field) => field.label),
        relation.columnLabel,
      ]];
      if (definition.key === "category") rows.push(["Finished Goods", "Shirt", "Full Sleeve, Half Sleeve"]);
      if (definition.key === "raw-material-category") rows.push(["ITEM", "Fabric", "", "Cotton, Linen"]);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), definition.label);
    }
    const file = Object.assign(
      new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })]),
      { name: "related-step.xlsx" },
    ) as File;
    const records = await parseOrganizationMasterSetupWorkbook(file, definitions, {
      "product-master": [{ id: "finished-goods-id", label: "Finished Goods" }],
      "raw-material-type": [{ id: "item-type-id", label: "ITEM" }],
    });

    expect(records).toContainEqual({
      moduleKey: "sub-category",
      label: "Full Sleeve",
      fields: {
        category: createOrganizationMasterSetupUploadLookupReference("category", "Shirt"),
      },
    });
    expect(records).toContainEqual({
      moduleKey: "sub-category",
      label: "Half Sleeve",
      fields: {
        category: createOrganizationMasterSetupUploadLookupReference("category", "Shirt"),
      },
    });
    expect(records).toContainEqual({
      moduleKey: "raw-material-sub-category",
      label: "Cotton",
      fields: {
        Raw_Material_Category1: createOrganizationMasterSetupUploadLookupReference("raw-material-category", "Fabric"),
      },
    });
    expect(records).toContainEqual({
      moduleKey: "raw-material-sub-category",
      label: "Linen",
      fields: {
        Raw_Material_Category1: createOrganizationMasterSetupUploadLookupReference("raw-material-category", "Fabric"),
      },
    });
  });

  it("imports records from present sheets when other step sheets are omitted or use their master label", async () => {
    const definitions = getOrganizationMasterSetupDefinitions("independent").map((definition) => ({
      key: definition.key,
      label: definition.label,
      labelField: definition.labelField,
      fields: getOrganizationMasterSetupFields(definition),
    }));
    const workbook = XLSX.utils.book_new();
    const colorIndex = definitions.findIndex((definition) => definition.key === "color");
    const colorDefinition = definitions[colorIndex];
    expect(colorDefinition).toBeDefined();
    const colorFields = colorDefinition.fields.filter((field) => !field.readOnly);
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        colorFields.map((field) => field.label),
        ["Navy"],
      ]),
      colorDefinition.label,
    );
    const file = Object.assign(
      new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })]),
      { name: "partial-independent-step.xlsx" },
    ) as File;

    await expect(parseOrganizationMasterSetupWorkbook(file, definitions, {}))
      .resolves.toEqual([{ moduleKey: "color", label: "Navy", fields: {} }]);
  });

  it("blocks upload when a required parent master is not available", async () => {
    const definition = getOrganizationMasterSetupDefinitions("related")
      .find((master) => master.key === "category");
    expect(definition).toBeDefined();
    const fields = getOrganizationMasterSetupFields(definition!);
    const workbook = XLSX.utils.book_new();
    const worksheetName = getOrganizationMasterSetupSheetName(0, definition!.label);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      fields.map((field) => field.label),
      ["Finished Goods", "Shirt"],
    ]), worksheetName);
    const file = Object.assign(
      new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })]),
      { name: "related-step.xlsx" },
    ) as File;

    await expect(parseOrganizationMasterSetupWorkbook(
      file,
      [ { key: definition!.key, label: definition!.label, labelField: definition!.labelField, fields } ],
      {},
    )).rejects.toThrow("not an active Finished Goods Type value");
  });
});
