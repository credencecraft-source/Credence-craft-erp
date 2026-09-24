import { createMasterValueForOrganization, getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { getMasterDefinition } from "@/lib/master-data/master-data-registry";

export type OrganizationMasterSetupRecord = {
  moduleKey: string;
  label: string;
  fields: Record<string, string | number | boolean | null | string[]>;
};

export async function createOrganizationMasterSetupStage(
  organizationId: string,
  records: OrganizationMasterSetupRecord[],
) {
  for (const record of records) {
    const definition = getMasterDefinition(record.moduleKey);
    if (!definition || definition.hidden) {
      throw new Error("One of the selected master types is not available.");
    }

    const label = record.label.trim();
    if (!label) continue;

    const created = await createMasterValueForOrganization(organizationId, record.moduleKey, {
      label,
      fields: record.fields,
    });
    if (record.moduleKey === "process-template") {
      const processIds = Array.isArray(record.fields.Process) ? record.fields.Process.map(String).filter(Boolean) : [];
      const processOptions = await getMasterValuesForOrganization(organizationId, "process-master", true);
      const processLabels = new Map(processOptions.map((option) => [option.id, option.label]));
      for (const [index, processId] of processIds.entries()) {
        await createMasterValueForOrganization(organizationId, "process-template-step", {
          label: processLabels.get(processId) ?? processId,
          parentValueId: created.id,
          fields: { Process: processId, Sl_No: index + 1 },
        });
      }
    }
  }
}