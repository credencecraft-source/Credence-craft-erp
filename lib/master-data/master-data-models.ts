export type MasterFieldType = "text" | "number" | "percentage" | "decimal" | "date" | "url" | "image" | "checkbox" | "picklist" | "lookup" | "child-list";

export type MasterFieldDefinition = {
  key: string;
  label: string;
  type: MasterFieldType;
  required?: boolean;
  unique?: boolean;
  options?: string[];
  initialValue?: string | number | boolean;
  lookupModuleKey?: string;
  multiple?: boolean;
  childModuleKey?: string;
  childFields?: MasterFieldDefinition[];
  dependsOn?: string;
  readOnly?: boolean;
};

export type MasterDefinition = {
  key: string;
  label: string;
  description: string;
  fields: MasterFieldDefinition[];
  labelField?: string;
  hidden?: boolean;
  moduleGroup?: string;
  moduleSubGroup?: string;
  moduleOrder?: number;
};

export const text = (
  key: string,
  label: string,
  options: Partial<MasterFieldDefinition> = {},
): MasterFieldDefinition => ({ key, label, type: "text", ...options });

export const lookup = (
  key: string,
  label: string,
  lookupModuleKey: string,
  options: Partial<MasterFieldDefinition> = {},
): MasterFieldDefinition => ({ key, label, type: "lookup", lookupModuleKey, ...options });

export const createMaster = (
  key: string,
  label: string,
  description: string,
  fields: MasterFieldDefinition[],
  options: Partial<Pick<MasterDefinition, "labelField" | "hidden" | "moduleGroup" | "moduleSubGroup" | "moduleOrder">> = {},
): MasterDefinition => ({
  key,
  label,
  description,
  fields,
  ...options,
});
