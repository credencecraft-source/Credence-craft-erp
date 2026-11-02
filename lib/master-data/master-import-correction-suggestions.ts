export type RelatedMasterSuggestion = {
  moduleKey: string;
  label: string;
  fields: Record<string, unknown>;
  articleFieldUpdates?: Record<string, unknown>;
  action?: "create-category-subcategory-pair";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRelatedMasterSuggestions(payload: unknown): RelatedMasterSuggestion[] {
  if (!isRecord(payload)) return [];
  const validationErrors = Array.isArray(payload.validationErrors) ? payload.validationErrors : [];
  const suggestions = new Map<string, RelatedMasterSuggestion>();
  for (const error of validationErrors) {
    if (!isRecord(error) || !Array.isArray(error.relatedMasters)) continue;
    for (const value of error.relatedMasters) {
      if (!isRecord(value) || typeof value.moduleKey !== "string" || typeof value.label !== "string"
        || !isRecord(value.fields)) continue;
      const suggestion: RelatedMasterSuggestion = {
        moduleKey: value.moduleKey,
        label: value.label,
        fields: value.fields,
        ...(isRecord(value.articleFieldUpdates) ? { articleFieldUpdates: value.articleFieldUpdates } : {}),
        ...(value.action === "create-category-subcategory-pair"
          ? { action: value.action }
          : {}),
      };
      suggestions.set(`${suggestion.moduleKey}:${suggestion.label.toLocaleLowerCase()}`, suggestion);
    }
  }
  const fields = isRecord(payload.fields) ? payload.fields : {};
  const category = String(fields.Category ?? "").trim();
  const subcategory = String(fields.Subcategory ?? "").trim();
  const productType = String(fields.Product_Master ?? "").trim();
  const hasCategoryMismatch = validationErrors.some((error) =>
    isRecord(error)
    && typeof error.message === "string"
    && /finished goods subcategory .* belongs to a different finished goods category/i.test(error.message));

  const hierarchySuggestions = [...suggestions.values()].filter(
    (suggestion) => suggestion.action === "create-category-subcategory-pair",
  );
  const hasCompleteHierarchyAction = hierarchySuggestions.some((suggestion) => suggestion.moduleKey === "category")
    && hierarchySuggestions.some((suggestion) => suggestion.moduleKey === "sub-category");
  if (!hasCompleteHierarchyAction && hasCategoryMismatch && category && subcategory) {
    suggestions.set(`category:${subcategory.toLocaleLowerCase()}`, {
      moduleKey: "category",
      label: subcategory,
      fields: { Product_Master: productType, Category_Name: subcategory },
      articleFieldUpdates: { Category: subcategory },
      action: "create-category-subcategory-pair",
    });
    suggestions.set(`sub-category:${category.toLocaleLowerCase()}`, {
      moduleKey: "sub-category",
      label: category,
      fields: { category: subcategory, sub_category: category },
      articleFieldUpdates: { Subcategory: category },
      action: "create-category-subcategory-pair",
    });
  }
  return [...suggestions.values()];
}
