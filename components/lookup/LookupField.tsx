"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

const LOOKUP_OPTION_LIMIT = 20;
const LOOKUP_DEBOUNCE_MS = 300;

export type LookupOption = {
  id: string;
  label: string;
};

export function createOrganizationMasterLookupLoader(organizationId: string, moduleKey: string) {
  return async (search: string, signal: AbortSignal): Promise<LookupOption[]> => {
    const query = new URLSearchParams({
      includeInactive: "false",
      limit: String(LOOKUP_OPTION_LIMIT),
      page: "true",
      shape: "select",
    });
    if (search.trim()) query.set("search", search.trim());

    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${encodeURIComponent(moduleKey)}?${query}`,
      { cache: "no-store", signal },
    );
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error("Unable to load lookup options.");
    }
    if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items)) {
      throw new Error("The lookup response is invalid.");
    }

    return result.items.flatMap((item): LookupOption[] => {
      if (!item || typeof item !== "object" || !("id" in item) || !("label" in item)) return [];
      return typeof item.id === "string" && typeof item.label === "string"
        ? [{ id: item.id, label: item.label }]
        : [];
    }).slice(0, LOOKUP_OPTION_LIMIT);
  };
}

type LookupFieldProps = {
  label: string;
  value?: string;
  options: LookupOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  dependsOnValue?: string;
  loadOptions?: (search: string, signal: AbortSignal) => Promise<LookupOption[]>;
  onChange: (value: string) => void;
};

export default function LookupField({
  label,
  value = "",
  options,
  placeholder,
  required = false,
  disabled = false,
  dependsOnValue,
  loadOptions,
  onChange,
}: LookupFieldProps) {
  const [search, setSearch] = useState(() => options.find((option) => option.id === value)?.label ?? (loadOptions ? "" : value));
  const [remoteOptions, setRemoteOptions] = useState<LookupOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!loadOptions || disabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      void loadOptions(search, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) setRemoteOptions(results.slice(0, LOOKUP_OPTION_LIMIT));
        })
        .catch(() => {
          if (!controller.signal.aborted) setLookupError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [disabled, loadOptions, retryCount, search]);

  const filtered = useMemo(() => {
    if (loadOptions) {
      const byId = new Map(options.map((option) => [option.id, option]));
      for (const option of remoteOptions) byId.set(option.id, option);
      return [...byId.values()].slice(0, LOOKUP_OPTION_LIMIT);
    }
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [loadOptions, options, remoteOptions, search]);

  useEffect(() => {
    if (!dependsOnValue && value) return;
    if (dependsOnValue === "") {
      onChange("");
    }
  }, [dependsOnValue, onChange, value]);

  return (
    <div className="space-y-1">
      <Input
        label={label}
        value={search}
        disabled={disabled}
        placeholder={placeholder ?? `Search ${label}`}
        hint={loadOptions
          ? isSearching
            ? "Searching..."
            : filtered.length === 0
              ? "No matching options."
              : undefined
          : undefined}
        error={loadOptions && lookupError ? "Unable to load lookup options. Change the search text to retry." : undefined}
        onChange={(e) => {
          if (loadOptions && value) onChange("");
          setIsSearching(false);
          setLookupError(false);
          setSearch(e.target.value);
        }}
        className="rounded-md"
      />
      {loadOptions && lookupError && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setLookupError(false);
            setIsSearching(false);
            setRetryCount((count) => count + 1);
          }}
        >
          Retry lookup
        </Button>
      )}

      <Select
        label={`Select ${label}`}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const selected = filtered.find((x) => x.id === e.target.value);
          onChange(e.target.value);
          setSearch(selected?.label ?? "");
        }}
        options={[
          { value: "", label: placeholder ?? `Select ${label}` },
          ...filtered.map((item) => ({ value: item.id, label: item.label })),
        ]}
        className="rounded-md"
      />
    </div>
  );
}