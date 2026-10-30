type RequiredField = {
  key: string;
  label: string;
  required?: boolean;
  dependsOn?: string;
};

function hasValue(value: unknown) {
  return Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== "";
}

export function getMissingRequiredFieldLabels(
  values: Record<string, unknown>,
  fields: RequiredField[],
  labelField?: string,
) {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const missingLabels = new Set<string>();

  for (const field of fields) {
    if (!field.required) continue;

    if (field.dependsOn && !hasValue(values[field.dependsOn])) {
      const parentField = fieldsByKey.get(field.dependsOn);
      missingLabels.add(parentField?.label ?? field.label);
      continue;
    }

    if (!hasValue(values[field.key])) {
      missingLabels.add(field.label);
    }
  }

  if (labelField && !hasValue(values[labelField])) {
    const label = fieldsByKey.get(labelField)?.label;
    if (label) missingLabels.add(label);
  }

  return [...missingLabels];
}

export function getRequiredFieldsErrorMessage(labels: string[]) {
  return `Please complete the following required fields: ${labels.join(", ")}.`;
}
