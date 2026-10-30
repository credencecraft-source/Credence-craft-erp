"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageSetupStickerSheetPreview from "@/components/erp/page-setup-sticker-sheet-preview";
import { type PageSetupTemplateInput } from "@/lib/services/design-development/page-setup-template-contract";

type PageSetupTemplate = PageSetupTemplateInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export default function PageSetupTemplateDetailPage({
  workspaceId,
  organizationId,
  templateId,
  canManage,
}: {
  workspaceId: string;
  organizationId: string;
  templateId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const baseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/page-setup`;
  const [template, setTemplate] = useState<PageSetupTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });
    void fetch(
      `/api/design-development/page-setup-templates/${encodeURIComponent(templateId)}?${query}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Page Setup template.");
        return data as { template: PageSetupTemplate };
      })
      .then(({ template: loadedTemplate }) => {
        if (!active) return;
        setTemplate(loadedTemplate);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load Page Setup template.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt, organizationId, templateId, workspaceId]);

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href={baseHref} className="text-sm font-medium text-[var(--erp-brand)] hover:underline">
            Page Setup
          </Link>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Page Setup Details</h1>
            <p className="text-sm text-slate-600">View the saved page format.</p>
          </div>
        </div>
        {template && canManage && (
          <Button
            type="button"
            onClick={() => router.push(`${baseHref}/${encodeURIComponent(templateId)}/edit`)}
          >
            Edit Template
          </Button>
        )}
      </header>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <Card><p className="text-sm text-[var(--erp-text-muted)]" role="status">Loading template...</p></Card>
      ) : template ? (
        <>
          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">{template.name}</h2>
            <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Paper Size</dt>
                <dd className="text-sm text-slate-900">{template.paperSize}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Orientation</dt>
                <dd className="text-sm text-slate-900">
                  {template.orientation.charAt(0) + template.orientation.slice(1).toLowerCase()}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sticker Size</dt>
                <dd className="text-sm text-slate-900">
                  {template.stickerWidthMm} × {template.stickerLengthMm} mm
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Margins (T / B / L / R)
                </dt>
                <dd className="text-sm text-slate-900">
                  {template.marginTopMm} / {template.marginBottomMm} / {template.marginLeftMm}
                  {" / "}{template.marginRightMm} mm
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Sticker Gaps (H / V)
                </dt>
                <dd className="text-sm text-slate-900">
                  {template.horizontalGapMm} / {template.verticalGapMm} mm
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">Last Updated</dt>
                <dd className="text-sm text-slate-900">{new Date(template.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </Card>
          <PageSetupStickerSheetPreview
            paperSize={template.paperSize}
            orientation={template.orientation}
            stickerWidthMm={template.stickerWidthMm}
            stickerLengthMm={template.stickerLengthMm}
            layout={template}
          />
        </>
      ) : null}
    </section>
  );
}
