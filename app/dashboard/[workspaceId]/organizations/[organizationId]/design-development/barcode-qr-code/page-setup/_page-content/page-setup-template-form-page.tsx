"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import PageSetupStickerSheetPreview from "@/components/erp/page-setup-sticker-sheet-preview";
import Select from "@/components/ui/Select";
import {
  DEFAULT_PAGE_SETUP_LAYOUT,
  PAGE_SETUP_GAP_MAX_MM,
  PAGE_SETUP_MARGIN_MAX_MM,
  DEFAULT_PAGE_SETUP_STICKER_LENGTH_MM,
  DEFAULT_PAGE_SETUP_STICKER_WIDTH_MM,
  PAGE_SETUP_ORIENTATIONS,
  PAGE_SETUP_PAPER_SIZES,
  type PageSetupOrientation,
  type PageSetupPaperSize,
} from "@/lib/services/design-development/page-setup-template-contract";

type PageSetupTemplate = {
  id: string;
  name: string;
  paperSize: PageSetupPaperSize;
  orientation: PageSetupOrientation;
  stickerWidthMm: number;
  stickerLengthMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
};

export default function PageSetupTemplateFormPage({
  workspaceId,
  organizationId,
  templateId,
}: {
  workspaceId: string;
  organizationId: string;
  templateId?: string;
}) {
  const router = useRouter();
  const baseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/page-setup`;
  const [name, setName] = useState("");
  const [paperSize, setPaperSize] = useState<PageSetupPaperSize>("A4");
  const [orientation, setOrientation] = useState<PageSetupOrientation>("PORTRAIT");
  const [stickerWidthMm, setStickerWidthMm] = useState(
    String(DEFAULT_PAGE_SETUP_STICKER_WIDTH_MM),
  );
  const [stickerLengthMm, setStickerLengthMm] = useState(
    String(DEFAULT_PAGE_SETUP_STICKER_LENGTH_MM),
  );
  const [marginTopMm, setMarginTopMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.marginTopMm));
  const [marginBottomMm, setMarginBottomMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.marginBottomMm));
  const [marginLeftMm, setMarginLeftMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.marginLeftMm));
  const [marginRightMm, setMarginRightMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.marginRightMm));
  const [horizontalGapMm, setHorizontalGapMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.horizontalGapMm));
  const [verticalGapMm, setVerticalGapMm] = useState(String(DEFAULT_PAGE_SETUP_LAYOUT.verticalGapMm));
  const [isLoading, setIsLoading] = useState(Boolean(templateId));
  const [hasLoadedTemplate, setHasLoadedTemplate] = useState(!templateId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!templateId) return;
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
      .then(({ template }) => {
        if (!active) return;
        setName(template.name);
        setPaperSize(template.paperSize);
        setOrientation(template.orientation);
        setStickerWidthMm(String(template.stickerWidthMm));
        setStickerLengthMm(String(template.stickerLengthMm));
        setMarginTopMm(String(template.marginTopMm));
        setMarginBottomMm(String(template.marginBottomMm));
        setMarginLeftMm(String(template.marginLeftMm));
        setMarginRightMm(String(template.marginRightMm));
        setHorizontalGapMm(String(template.horizontalGapMm));
        setVerticalGapMm(String(template.verticalGapMm));
        setHasLoadedTemplate(true);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const query = new URLSearchParams({ organizationId, workspaceId });
      const response = await fetch(
        templateId
          ? `/api/design-development/page-setup-templates/${encodeURIComponent(templateId)}?${query}`
          : `/api/design-development/page-setup-templates?${query}`,
        {
          method: templateId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            paperSize,
            orientation,
            stickerWidthMm: Number(stickerWidthMm),
            stickerLengthMm: Number(stickerLengthMm),
            marginTopMm: Number(marginTopMm),
            marginBottomMm: Number(marginBottomMm),
            marginLeftMm: Number(marginLeftMm),
            marginRightMm: Number(marginRightMm),
            horizontalGapMm: Number(horizontalGapMm),
            verticalGapMm: Number(verticalGapMm),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save Page Setup template.");
      router.push(`${baseHref}/${encodeURIComponent(data.template.id)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Page Setup template.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-2">
        <Link href={templateId ? `${baseHref}/${encodeURIComponent(templateId)}` : baseHref}
          className="text-sm font-medium text-[var(--erp-brand)] hover:underline">
          Page Setup
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">
            {templateId ? "Edit Page Setup Template" : "Create Page Setup Template"}
          </h1>
          <p className="text-sm text-slate-600">
            Define the template, sticker dimensions, and page orientation.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            {templateId && !hasLoadedTemplate && (
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
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <Card><p className="text-sm text-[var(--erp-text-muted)]" role="status">Loading template...</p></Card>
      ) : templateId && !hasLoadedTemplate ? (
        <Card className="space-y-3">
          <p className="text-sm text-[var(--erp-text-muted)]">
            The saved template could not be loaded. Retry before making changes.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </Card>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)]">
            <PageSetupStickerSheetPreview
              paperSize={paperSize}
              orientation={orientation}
              stickerWidthMm={Number(stickerWidthMm)}
              stickerLengthMm={Number(stickerLengthMm)}
              layout={{
                marginTopMm: Number(marginTopMm),
                marginBottomMm: Number(marginBottomMm),
                marginLeftMm: Number(marginLeftMm),
                marginRightMm: Number(marginRightMm),
                horizontalGapMm: Number(horizontalGapMm),
                verticalGapMm: Number(verticalGapMm),
              }}
            />
            <Card className="min-w-0 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Page Template</h2>
              <Input
                label="Template Name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={100}
                required
              />
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Select
                  label="Paper Size"
                  value={paperSize}
                  onChange={(event) => setPaperSize(event.currentTarget.value as PageSetupPaperSize)}
                >
                  {PAGE_SETUP_PAPER_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </Select>
                <Select
                  label="Orientation"
                  value={orientation}
                  onChange={(event) => setOrientation(event.currentTarget.value as PageSetupOrientation)}
                >
                  {PAGE_SETUP_ORIENTATIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Input
                  label="Sticker Width (mm)"
                  type="number"
                  min={1}
                  max={500}
                  step="0.1"
                  value={stickerWidthMm}
                  onChange={(event) => setStickerWidthMm(event.currentTarget.value)}
                  required
                />
                <Input
                  label="Sticker Length (mm)"
                  type="number"
                  min={1}
                  max={500}
                  step="0.1"
                  value={stickerLengthMm}
                  onChange={(event) => setStickerLengthMm(event.currentTarget.value)}
                  required
                />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Margins and Sticker Gaps (mm)</h3>
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <Input
                    label="Top"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_MARGIN_MAX_MM}
                    step="0.1"
                    value={marginTopMm}
                    onChange={(event) => setMarginTopMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                  <Input
                    label="Bottom"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_MARGIN_MAX_MM}
                    step="0.1"
                    value={marginBottomMm}
                    onChange={(event) => setMarginBottomMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                  <Input
                    label="Left"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_MARGIN_MAX_MM}
                    step="0.1"
                    value={marginLeftMm}
                    onChange={(event) => setMarginLeftMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                  <Input
                    label="Right"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_MARGIN_MAX_MM}
                    step="0.1"
                    value={marginRightMm}
                    onChange={(event) => setMarginRightMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                  <Input
                    label="H. Gap"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_GAP_MAX_MM}
                    step="0.1"
                    value={horizontalGapMm}
                    onChange={(event) => setHorizontalGapMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                  <Input
                    label="V. Gap"
                    type="number"
                    min={0}
                    max={PAGE_SETUP_GAP_MAX_MM}
                    step="0.1"
                    value={verticalGapMm}
                    onChange={(event) => setVerticalGapMm(event.currentTarget.value)}
                    className="px-2 py-2"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push(templateId ? `${baseHref}/${encodeURIComponent(templateId)}` : baseHref)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : templateId ? "Save Changes" : "Create Template"}
                </Button>
              </div>
            </Card>
          </div>
        </form>
      )}
    </section>
  );
}
