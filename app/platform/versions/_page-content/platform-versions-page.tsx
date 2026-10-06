import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import PlatformVersionsList from "@/app/platform/versions/_components/platform-versions-list";
import { PLATFORM_VERSION_TYPE_OPTIONS } from "@/lib/constants/platform-version-types";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { createVersion, deleteVersion, duplicateVersion, listVersions } from "@/lib/services/platform/version-service";

export default async function PlatformVersionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const [versions, params] = await Promise.all([
    listVersions(),
    searchParams ?? Promise.resolve({ error: undefined, success: undefined } as { error?: string; success?: string }),
  ]);

  async function createAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await createVersion({
        versionName: String(formData.get("versionName") || ""),
        description: String(formData.get("description") || ""),
        versionType: String(formData.get("versionType") || ""),
      });
    } catch (error) {
      redirect(`/platform/versions?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create version.")}`);
    }
    redirect("/platform/versions");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteVersion(String(formData.get("id") || ""));
    } catch (error) {
      redirect(`/platform/versions?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete version.")}`);
    }
    redirect("/platform/versions");
  }

  async function duplicateAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await duplicateVersion(String(formData.get("id") || ""));
    } catch (error) {
      redirect(`/platform/versions?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to duplicate version.")}`);
    }
    redirect("/platform/versions?success=Version%20duplicated.");
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Catalog</p>
          <h1 className="erp-page-heading">Versions</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--erp-muted)]">
            Create release or commercial versions such as 2025, 2026, A, or B, then configure their business-type segments.
          </p>
        </div>

        {params.error && (
          <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]">
            {params.error}
          </p>
        )}
        {params.success && (
          <p role="status" className="rounded-xl border border-[var(--erp-brand-soft)] bg-[var(--erp-brand-soft)] p-4 text-sm font-medium text-[var(--erp-brand)]">
            {params.success}
          </p>
        )}

        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[var(--erp-text)]">Create a version</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              New versions start with all active business types. Configure their segments after creation.
            </p>
          </div>
          <form action={createAction} className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-end">
            <Input label="Version name" name="versionName" required placeholder="2026" />
            <Select
              label="Version type"
              name="versionType"
              required
              defaultValue="REGULAR_PRICE"
              options={PLATFORM_VERSION_TYPE_OPTIONS}
            />
            <Input label="Description" name="description" placeholder="Optional release notes" />
            <Button type="submit">Create version</Button>
          </form>
        </Card>

        <PlatformVersionsList
          versions={versions.map((version, index) => ({
            id: version.id,
            version_name: version.version_name,
            version_type: version.version_type,
            description: version.description,
            businessTypeCount: version._count.businessTypes,
            organizationCount: version._count.organizations,
            sortOrder: index + 1,
          }))}
          deleteAction={deleteAction}
          duplicateAction={duplicateAction}
        />
      </Section>
    </Page>
  );
}
