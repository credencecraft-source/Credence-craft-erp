import { normalizeUppercase } from "@/lib/utilities/text-case";

export class UniformManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniformManagementError";
  }
}

export type UniformMeasurementInput = {
  fieldKey: string;
  value: string;
};

export function normalizeUniformText(value: string, label: string, maximumLength: number) {
  const normalized = normalizeUppercase(value.trim());
  if (!normalized || normalized.length > maximumLength) {
    throw new UniformManagementError(`${label} is required and must be ${maximumLength} characters or fewer.`);
  }
  return normalized;
}

export function normalizeOptionalUniformText(value: string, maximumLength: number) {
  const normalized = normalizeUppercase(value.trim());
  if (normalized.length > maximumLength) {
    throw new UniformManagementError(`Text must be ${maximumLength} characters or fewer.`);
  }
  return normalized || null;
}

export function toUniformMeasurementKey(label: string) {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!key || key.length > 64) {
    throw new UniformManagementError("Measurement name must contain between 1 and 64 letters or numbers.");
  }
  return key;
}

export function parseUniformMeasurementValue(value: string, label: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new UniformManagementError(`${label} must be a positive measurement with up to two decimal places.`);
  }
  return normalized;
}

export function parseUniformDate(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new UniformManagementError("Enter a valid due date.");
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new UniformManagementError("Enter a valid due date.");
  }
  return date;
}
