"use client";

import { usePathname, useRouter } from "next/navigation";

export function MasterModuleSwitcher({
  value,
  options,
}: {
  value: string;
  options: ReadonlyArray<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (nextValue: string) => {
    const segments = pathname.split("/").filter(Boolean);
    const organizationsIndex = segments.indexOf("organizations");

    if (organizationsIndex === -1) {
      router.push(`/${nextValue}`);
      return;
    }

    const basePath = segments.slice(0, organizationsIndex + 2).join("/");
    const nextPath = basePath ? `/${basePath}/${nextValue}` : `/${nextValue}`;
    router.push(nextPath);
  };

  return (
    <select
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none"
    >
      {options.map((module) => (
        <option key={module.key} value={module.key} className="text-slate-800">
          {module.label}
        </option>
      ))}
    </select>
  );
}
