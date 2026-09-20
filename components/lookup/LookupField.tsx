"use client";

import { useEffect, useMemo, useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export type LookupOption = {
  id: string;
  label: string;
};

type LookupFieldProps = {
  label: string;
  value?: string;
  options: LookupOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  dependsOnValue?: string;
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
  onChange,
}: LookupFieldProps) {
  const [search, setSearch] = useState(value);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!search) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

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
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-md"
      />

      <Select
        label={`Select ${label}`}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const selected = options.find((x) => x.id === e.target.value);
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