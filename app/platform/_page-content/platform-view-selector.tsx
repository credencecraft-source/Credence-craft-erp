"use client";

import Select from "@/components/ui/Select";
import type { PlatformViewMode } from "@/lib/auth/platform-session-manager";

type PlatformViewSelectorProps = {
  action: (formData: FormData) => void | Promise<void>;
  value: PlatformViewMode;
};

export default function PlatformViewSelector({ action, value }: PlatformViewSelectorProps) {
  return (
    <form action={action} className="flex items-center">
      <Select
        aria-label="Platform role view"
        name="mode"
        value={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="w-auto py-2"
      >
        <option value="SUPER_ADMIN">Super Admin</option>
        <optgroup label="Admin">
          <option value="ADMIN">Admin</option>
          <option value="CTO">CTO</option>
          <option value="CMO">CMO</option>
        </optgroup>
      </Select>
    </form>
  );
}
