export type QuickCreateLookupOption = {
  id: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
  fields?: Record<string, unknown>;
  sizes?: QuickCreateLookupOption[];
};

export function mergeQuickCreateLookupOptions(
  current: Record<string, QuickCreateLookupOption[]>,
  loaded: Record<string, QuickCreateLookupOption[]>,
): Record<string, QuickCreateLookupOption[]> {
  const merged = { ...loaded };

  for (const [lookupKey, currentOptions] of Object.entries(current)) {
    const loadedOptions = merged[lookupKey] ?? [];
    merged[lookupKey] = [
      ...loadedOptions,
      ...currentOptions.filter((option) => !loadedOptions.some((loadedOption) =>
        loadedOption.id === option.id || loadedOption.label === option.label)),
    ];
  }

  return merged;
}

export async function loadQuickCreateLookupOptions(
  organizationId: string,
  lookupKeys: string[],
  signal: AbortSignal,
): Promise<Record<string, QuickCreateLookupOption[]>> {
  const results = await Promise.all(lookupKeys.map(async (lookupKey) => {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(lookupKey)}`,
      { cache: "no-store", signal },
    );
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(typeof data === "object" && data !== null && "error" in data
        ? String(data.error)
        : `Unable to load ${lookupKey} options.`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`Unable to load ${lookupKey} options.`);
    }
    return [lookupKey, data as QuickCreateLookupOption[]] as const;
  }));

  return Object.fromEntries(results);
}
