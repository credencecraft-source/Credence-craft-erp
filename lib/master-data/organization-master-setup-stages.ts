import type { MasterDefinition } from "@/lib/master-data/master-data-registry";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";

export type OrganizationMasterSetupStage = "independent" | "related" | "third";
export const ORGANIZATION_MASTER_SETUP_UPLOAD_LOOKUP_PREFIX = "__setup_upload_lookup__:";
export const ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN = {
  category: {
    childModuleKey: "sub-category",
    childParentFieldKey: "category",
    columnLabel: "Subcategories (comma-separated)",
  },
  "raw-material-category": {
    childModuleKey: "raw-material-sub-category",
    childParentFieldKey: "Raw_Material_Category1",
    columnLabel: "Subcategories (comma-separated)",
  },
} as const;

export function createOrganizationMasterSetupUploadLookupReference(moduleKey: string, label: string) {
  return `${ORGANIZATION_MASTER_SETUP_UPLOAD_LOOKUP_PREFIX}${encodeURIComponent(moduleKey)}:${encodeURIComponent(label.trim().toLocaleLowerCase())}`;
}

export function parseOrganizationMasterSetupUploadLookupReference(value: string) {
  if (!value.startsWith(ORGANIZATION_MASTER_SETUP_UPLOAD_LOOKUP_PREFIX)) return null;
  const reference = value.slice(ORGANIZATION_MASTER_SETUP_UPLOAD_LOOKUP_PREFIX.length);
  const separator = reference.indexOf(":");
  if (separator < 0) return null;
  try {
    return {
      moduleKey: decodeURIComponent(reference.slice(0, separator)),
      normalizedLabel: decodeURIComponent(reference.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export type OrganizationMasterSetupField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  readOnly: boolean;
  lookupModuleKey: string;
  multiple: boolean;
  options?: string[];
};

export const ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS = new Set([
  "article", "category-type", "gold-seal", "gold-seal-variant", "gst", "gst-type", "hsn",
  "measurement-chart", "operation", "operation-template", "raw-material", "raw-material-type",
  "season", "size-wise-consumption", "state",
]);

const THIRD_STAGE_KEYS = new Set([
  "operation",
  "size-group",
]);

function isRelatedMaster(definition: MasterDefinition) {
  return definition.fields.some((field) => field.type === "lookup" || field.type === "child-list");
}

export function getOrganizationMasterSetupDefinitions(stage: OrganizationMasterSetupStage) {
  const definitions = MASTER_DEFINITIONS.filter((definition) =>
    !definition.hidden &&
    definition.fields.length > 0 &&
    !ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS.has(definition.key),
  );

  if (stage === "independent") {
    return definitions.filter((definition) =>
      !isRelatedMaster(definition) && !THIRD_STAGE_KEYS.has(definition.key),
    );
  }
  if (stage === "related") {
    return definitions.filter((definition) =>
      isRelatedMaster(definition) && !THIRD_STAGE_KEYS.has(definition.key),
    );
  }
  return definitions.filter((definition) => THIRD_STAGE_KEYS.has(definition.key));
}

export function getOrganizationMasterSetupWorkbookDefinitions(stage: OrganizationMasterSetupStage) {
  return getOrganizationMasterSetupDefinitions(stage).filter(
    (definition) => !Object.values(ORGANIZATION_MASTER_SETUP_INLINE_CHILDREN)
      .some((relation) => relation.childModuleKey === definition.key),
  );
}

export function getOrganizationMasterSetupFields(
  definition: MasterDefinition,
): OrganizationMasterSetupField[] {
  return definition.fields.flatMap<OrganizationMasterSetupField>((field) => {
    if (
      definition.key === "category" &&
      ["Create_Cost_Center", "Maximum_Excess_Allowed"].includes(field.key)
    ) {
      return [];
    }
    if (definition.key === "process-template" && field.type === "child-list") {
      return [{
        key: "Process",
        label: "Process Master",
        type: "lookup",
        required: true,
        readOnly: false,
        lookupModuleKey: "process-master",
        multiple: true,
        options: [],
      }];
    }
    return [{
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      readOnly: field.readOnly ?? false,
      lookupModuleKey: field.lookupModuleKey ?? "",
      multiple: field.multiple ?? false,
      options: field.options,
    }];
  });
}

export function getOrganizationMasterSetupSheetName(index: number, label: string) {
  const safeLabel = label.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  return `${String(index + 1).padStart(2, "0")} - ${safeLabel}`.slice(0, 31);
}
