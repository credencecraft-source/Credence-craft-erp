export type Operation = {
  id: string;
  sourceOperationId?: string;
  valueId?: string;
  slNo: number;
  operation: string;
  price: number | string;
};

export type OperationTemplate = {
  id: string;
  valueId?: string;
  label: string;
  operations?: Operation[];
};

type ProcessRow = {
  [key: string]: unknown;
  id?: string;
  processId?: string;
  processName?: string;
  operation?: string;
  slNo?: number;
  operationTemplateId?: string | null;
  operationTemplateName?: string | null;
  operationTemplates?: OperationTemplate[];
  operations?: Operation[];
};

export type ProcessFields = {
  processTemplateId: string;
  processRows: ProcessRow[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOperation = (value: unknown): value is Operation =>
  isRecord(value)
  && typeof value.id === "string"
  && (value.sourceOperationId === undefined || typeof value.sourceOperationId === "string")
  && (value.valueId === undefined || typeof value.valueId === "string")
  && typeof value.slNo === "number"
  && typeof value.operation === "string"
  && (typeof value.price === "number" || typeof value.price === "string");

const isOperationTemplate = (value: unknown): value is OperationTemplate =>
  isRecord(value)
  && typeof value.id === "string"
  && (value.valueId === undefined || typeof value.valueId === "string")
  && typeof value.label === "string"
  && (value.operations === undefined || (Array.isArray(value.operations) && value.operations.every(isOperation)));

const isProcessRow = (value: unknown): value is ProcessRow =>
  isRecord(value)
  && ["id", "processId", "processName", "operation", "operationTemplateId", "operationTemplateName"].every(
    (field) => value[field] === undefined || value[field] === null || typeof value[field] === "string",
  )
  && (value.slNo === undefined || typeof value.slNo === "number")
  && (value.operationTemplates === undefined || (Array.isArray(value.operationTemplates) && value.operationTemplates.every(isOperationTemplate)))
  && (value.operations === undefined || (Array.isArray(value.operations) && value.operations.every(isOperation)));

export function getProcessRows(form: unknown): ProcessRow[] {
  if (!Array.isArray(form)) return [];
  return form.filter(isProcessRow);
}
