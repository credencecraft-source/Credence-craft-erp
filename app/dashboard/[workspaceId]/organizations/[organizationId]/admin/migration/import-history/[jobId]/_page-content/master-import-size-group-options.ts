export type ExistingSizeGroupOption = {
  id: string;
  label: string;
  brand: string;
  measurementChart: string;
  sizes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getCompatibleExistingSizeGroups(
  payload: unknown,
  brandKeys: ReadonlySet<string>,
  requiredSizes: readonly string[],
): ExistingSizeGroupOption[] {
  if (!Array.isArray(payload)) return [];

  const requiredSizeKeys = new Set(requiredSizes.map((size) => size.toLocaleLowerCase()));
  return payload.flatMap((value): ExistingSizeGroupOption[] => {
    if (!isRecord(value) || value.is_active !== true || typeof value.id !== "string"
      || typeof value.label !== "string" || !isRecord(value.fields)
      || !Array.isArray(value.sizes)) return [];

    const fields = value.fields;
    const brand = typeof fields.Brand1 === "string" ? fields.Brand1.trim() : "";
    if (!brandKeys.has(brand.toLocaleLowerCase())) return [];

    const sizes = value.sizes.flatMap((size) =>
      isRecord(size) && size.is_active === true && typeof size.label === "string"
        ? [size.label]
        : []);
    const availableSizeKeys = new Set(sizes.map((size) => size.toLocaleLowerCase()));
    if (![...requiredSizeKeys].every((size) => availableSizeKeys.has(size))) return [];

    return [{
      id: value.id,
      label: value.label,
      brand,
      measurementChart: typeof fields.Measurement_Chart1 === "string"
        ? fields.Measurement_Chart1.trim()
        : "",
      sizes,
    }];
  });
}
