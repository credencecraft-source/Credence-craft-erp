"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlatformVersionType } from "@prisma/client";

import VersionDeleteForm from "@/app/platform/versions/_components/version-delete-form";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table from "@/components/ui/Table";
import Tabs, { type Tab } from "@/components/ui/Tabs";
import { getPlatformVersionTypeLabel } from "@/lib/constants/platform-version-types";

type VersionListItem = {
  id: string;
  version_name: string;
  version_type: PlatformVersionType;
  description: string | null;
  businessTypeCount: number;
  organizationCount: number;
  sortOrder: number;
};

type VersionListAction = (formData: FormData) => void | Promise<void>;
type VersionFilter = "ALL" | PlatformVersionType;

const VERSION_FILTERS: readonly Tab<VersionFilter>[] = [
  { value: "ALL", label: "All versions" },
  { value: "BEST_PRICE", label: "Best Price" },
  { value: "REGULAR_PRICE", label: "Regular Price" },
  { value: "PREMIUM", label: "Premium" },
];

export default function PlatformVersionsList({
  versions,
  deleteAction,
  duplicateAction,
}: {
  versions: VersionListItem[];
  deleteAction: VersionListAction;
  duplicateAction: VersionListAction;
}) {
  const [activeType, setActiveType] = useState<VersionFilter>("ALL");

  const filteredVersions = useMemo(
    () => versions.filter((version) => activeType === "ALL" || version.version_type === activeType),
    [activeType, versions],
  );

  const versionTabs = VERSION_FILTERS.map((tab) => {
    const count = tab.value === "ALL"
      ? versions.length
      : versions.filter((version) => version.version_type === tab.value).length;

    return {
      ...tab,
      label: `${tab.label} (${count})`,
    };
  });

  return (
    <section className="min-w-0 space-y-4" aria-label="Version list">
      <Tabs
        tabs={versionTabs}
        value={activeType}
        onChange={setActiveType}
        ariaLabel="Filter versions by type"
        compact
        scrollable
      />

      {filteredVersions.length > 0 ? (
        <Table aria-label={`${activeType === "ALL" ? "All" : getPlatformVersionTypeLabel(activeType)} versions`}>
          <thead className="erp-table-head">
            <tr>
              <th scope="col" className="px-4 py-3">SL No.</th>
              <th scope="col" className="px-4 py-3">Sort order</th>
              <th scope="col" className="px-4 py-3">Version</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Business types</th>
              <th scope="col" className="px-4 py-3">Organizations</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--erp-border)]">
            {filteredVersions.map((version, index) => {
              const inUse = version.organizationCount > 0;

              return (
                <tr key={version.id} className="align-middle transition-colors hover:bg-[var(--erp-surface-soft)]">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--erp-muted)]">
                    {index + 1}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-[var(--erp-text)]">
                    {version.sortOrder}
                  </td>
                  <td className="min-w-56 px-4 py-3">
                    <span className="font-semibold text-[var(--erp-text)]">
                      {version.version_name}
                    </span>
                    <p className="mt-1 max-w-xl text-sm text-[var(--erp-muted)]">
                      {version.description || "No description provided."}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge>{getPlatformVersionTypeLabel(version.version_type)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge className="border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]">
                      {version.businessTypeCount}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge>{version.organizationCount} assigned</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/platform/versions/${version.id}`}
                        className="text-sm font-semibold text-[var(--erp-brand)] hover:underline"
                      >
                        Configure
                      </Link>
                      <form action={duplicateAction}>
                        <input type="hidden" name="id" value={version.id} />
                        <Button type="submit" variant="secondary" size="sm">Duplicate</Button>
                      </form>
                      {inUse ? (
                        <Badge className="border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]">
                          In use
                        </Badge>
                      ) : (
                        <VersionDeleteForm
                          versionId={version.id}
                          versionName={version.version_name}
                          action={deleteAction}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <Card className="text-center">
          <h2 className="text-base font-semibold text-[var(--erp-text)]">
            {activeType === "ALL"
              ? "No versions yet"
              : `No ${getPlatformVersionTypeLabel(activeType)} versions`}
          </h2>
          <p className="mt-1 text-sm text-[var(--erp-muted)]">
            {activeType === "ALL"
              ? "Create your first version above to begin configuring business types and segments."
              : "Create a version with this type to see it listed here."}
          </p>
        </Card>
      )}
    </section>
  );
}
