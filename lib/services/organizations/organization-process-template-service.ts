import type { Prisma } from "@prisma/client";

const DEFAULT_PROCESS_TEMPLATE_NAME = "No Embroidery Only Wash";
const DEFAULT_PROCESS_TEMPLATE_STEPS = [
  { processName: "Cutting", operationTemplateName: "Cutting Basic" },
  { processName: "Production", operationTemplateName: "Parts Basic" },
  { processName: "Washing", operationTemplateName: "Washing Basic" },
  { processName: "KajaButtoning", operationTemplateName: "KajaButtoning Basic" },
  { processName: "Iron", operationTemplateName: "Iron" },
  { processName: "Packing", operationTemplateName: "Packing" },
] as const;

export async function ensureDefaultProcessTemplate(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  if (!organizationId) throw new Error("Organization is required to create a process template.");

  const existingTemplate = await transaction.masterProcessTemplate.findFirst({
    where: { organization_id: organizationId, process_name: DEFAULT_PROCESS_TEMPLATE_NAME },
    select: { id: true },
  });
  if (existingTemplate) return existingTemplate.id;

  const processIds = new Map<string, string>();
  const operationTemplateIds = new Map<string, string>();
  for (const [index, step] of DEFAULT_PROCESS_TEMPLATE_STEPS.entries()) {
    let process = await transaction.masterProcess.findFirst({
      where: { organization_id: organizationId, process_name: step.processName },
      select: { id: true },
    });
    if (!process) {
      process = await transaction.masterProcess.create({
        data: {
          organization_id: organizationId,
          process_name: step.processName,
          is_active: true,
          sort_order: index,
        },
        select: { id: true },
      });
    }
    processIds.set(step.processName, process.id);

    let operationTemplate = await transaction.masterOperationTemplate.findFirst({
      where: { organization_id: organizationId, operation_template_name: step.operationTemplateName },
      select: { id: true },
    });
    if (!operationTemplate) {
      operationTemplate = await transaction.masterOperationTemplate.create({
        data: {
          organization_id: organizationId,
          operation_template_name: step.operationTemplateName,
          process_id: process.id,
          is_active: true,
          sort_order: index,
        },
        select: { id: true },
      });
    }
    operationTemplateIds.set(step.processName, operationTemplate.id);

    const operation = await transaction.masterOperationTemplateStep.findFirst({
      where: {
        organization_id: organizationId,
        operation_template_id: operationTemplate.id,
        operation: step.operationTemplateName,
      },
      select: { id: true },
    });
    if (!operation) {
      await transaction.masterOperationTemplateStep.create({
        data: {
          organization_id: organizationId,
          operation_template_id: operationTemplate.id,
          operation: step.operationTemplateName,
          sl_no: 1,
          price: 0,
          is_active: true,
          sort_order: 0,
        },
      });
    }
  }

  const firstProcessId = processIds.get(DEFAULT_PROCESS_TEMPLATE_STEPS[0].processName);
  const lastProcessId = processIds.get("Iron");
  if (!firstProcessId || !lastProcessId) {
    throw new Error("Default process template boundaries could not be resolved.");
  }
  const processTemplate = await transaction.masterProcessTemplate.create({
    data: {
      organization_id: organizationId,
      process_name: DEFAULT_PROCESS_TEMPLATE_NAME,
      is_active: true,
      sort_order: 0,
      legacy_metadata: {
        first_process_id: firstProcessId,
        last_process_id: lastProcessId,
      },
    },
    select: { id: true },
  });
  await transaction.masterProcessTemplateStep.createMany({
    data: DEFAULT_PROCESS_TEMPLATE_STEPS.map((step, index) => {
      const processId = processIds.get(step.processName);
      const operationTemplateId = operationTemplateIds.get(step.processName);
      if (!processId || !operationTemplateId) {
        throw new Error(`Default process template step "${step.processName}" could not be resolved.`);
      }
      return {
        organization_id: organizationId,
        process_template_id: processTemplate.id,
        process_id: processId,
        operation_template_id: operationTemplateId,
        process_name: step.processName,
        sl_no: index + 1,
        is_active: true,
        sort_order: index,
        legacy_metadata: {
          is_returnable_process: false,
          block_by_process_id: null,
        },
      };
    }),
  });

  return processTemplate.id;
}
