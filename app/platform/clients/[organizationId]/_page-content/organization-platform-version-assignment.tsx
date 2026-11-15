"use client";

import { useState } from "react";
import type { PlatformVersionType } from "@prisma/client";

import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Tabs, { type Tab } from "@/components/ui/Tabs";
import {
  getPlatformVersionTypeLabel,
  PLATFORM_VERSION_TYPE_OPTIONS,
} from "@/lib/constants/platform-version-types";

type PlatformVersionOption = {
  id: string;
  version_name: string;
  version_type: PlatformVersionType;
  description: string | null;
};

export default function OrganizationPlatformVersionAssignment({
  versions,
  assignedVersionId,
  action,
}: {
  versions: PlatformVersionOption[];
  assignedVersionId: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const assignedVersion = versions.find((version) => version.id === assignedVersionId);
  const initialType = assignedVersion?.version_type ?? "REGULAR_PRICE";
  const [selectedType, setSelectedType] = useState<PlatformVersionType>(initialType);
  const filteredVersions = versions.filter((version) => version.version_type === selectedType);
  const [selectedVersionId, setSelectedVersionId] = useState(
    assignedVersion && assignedVersion.version_type === initialType
      ? assignedVersion.id
      : versions.find((version) => version.version_type === initialType)?.id ?? "",
  );

  const changeType = (versionType: PlatformVersionType) => {
    setSelectedType(versionType);
    const matchingVersions = versions.filter((version) => version.version_type === versionType);
    setSelectedVersionId(
      matchingVersions.some((version) => version.id === assignedVersionId)
        ? assignedVersionId ?? ""
        : matchingVersions[0]?.id ?? "",
    );
  };

  const tabs: Tab<PlatformVersionType>[] = PLATFORM_VERSION_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: `${option.label} (${versions.filter((version) => version.version_type === option.value).length})`,
  }));

  return (
    <form action={action} className="mt-4 space-y-4">
      <Tabs
        tabs={tabs}
        value={selectedType}
        onChange={changeType}
        ariaLabel="Choose version type"
        compact
        scrollable
      />
      <input type="hidden" name="versionType" value={selectedType} />
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <Select
          id="platform-version"
          label={`${getPlatformVersionTypeLabel(selectedType)} version`}
          name="platformVersionId"
          value={selectedVersionId}
          onChange={(event) => setSelectedVersionId(event.target.value)}
          required
          disabled={filteredVersions.length === 0}
          className="min-w-0 flex-1"
          options={filteredVersions.length > 0
            ? filteredVersions.map((version) => ({
                value: version.id,
                label: `${version.version_name}${version.description ? ` - ${version.description}` : ""}`,
              }))
            : [{ value: "", label: `No active ${getPlatformVersionTypeLabel(selectedType)} versions available` }]}
        />
        <Button type="submit" size="sm" disabled={filteredVersions.length === 0}>
          Assign version
        </Button>
      </div>
    </form>
  );
}
