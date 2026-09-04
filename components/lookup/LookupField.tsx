"use client";

import { useEffect, useMemo, useState } from "react";

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
      setSearch("");
    }
  }, [dependsOnValue]);

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>

      <input
        type="text"
        value={search}
        disabled={disabled}
        placeholder={placeholder ?? `Search ${label}`}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
      />

      <select
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const selected = options.find((x) => x.id === e.target.value);
          onChange(e.target.value);
          setSearch(selected?.label ?? "");
        }}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
      >
        <option value="">
          {placeholder ?? `Select ${label}`}
        </option>

        {filtered.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}