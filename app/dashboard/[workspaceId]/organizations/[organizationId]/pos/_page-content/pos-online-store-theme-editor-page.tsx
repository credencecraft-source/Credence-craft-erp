"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Plus, Store, Trash2 } from "lucide-react";
import Image from "next/image";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";
import type { OnlineStorePresentation, OnlineStoreSlide } from "@/lib/services/pos/public-online-store-service";

export default function PosOnlineStoreThemeEditorPage({
  workspaceId,
  organizationId,
  themeId,
  initialPresentation,
}: {
  workspaceId: string;
  organizationId: string;
  themeId: OnlineStorePresentation["themeId"];
  initialPresentation: OnlineStorePresentation;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"slideshow" | "typography" | "effects">("slideshow");
  const [presentation, setPresentation] = useState({
    ...initialPresentation,
    themeId,
  });

  const readImage = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The selected slide image could not be read."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("The selected slide image could not be read."));
    reader.readAsDataURL(file);
  });

  const updateSlideImage = async (
    event: ChangeEvent<HTMLInputElement>,
    slideId: string,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 600 * 1024) {
      setError("Each slide image must be 600 KB or smaller.");
      return;
    }
    try {
      const imageDataUrl = await readImage(file);
      setPresentation((current) => ({
        ...current,
        slides: current.slides.map((slide) => slide.id === slideId
          ? { ...slide, imageDataUrl }
          : slide),
      }));
      setError("");
      setNotice("");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The slide image could not be read.");
    }
  };

  const updateSlide = (slideId: string, values: Partial<OnlineStoreSlide>) => {
    setPresentation((current) => ({
      ...current,
      slides: current.slides.map((slide) => slide.id === slideId ? { ...slide, ...values } : slide),
    }));
  };

  const savePresentation = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/online-store`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presentation }),
        },
      );
      const data = await response.json() as { presentation?: OnlineStorePresentation; error?: string };
      if (!response.ok || !data.presentation) {
        throw new Error(data.error || "Unable to save slideshow settings.");
      }
      setPresentation(data.presentation);
      setNotice("Slideshow settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save slideshow settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2"><Store aria-hidden="true" size={16} /> POS Online Store</p>
            <h1 className="erp-page-heading mt-1">
              {themeId === "fashion-atelier" ? "Fashion Atelier theme" : "Vibrant Editorial theme"}
            </h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Customize the slideshow, typography, and image treatment used by your public shop.
            </p>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/online-store/manage`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Back to themes
          </Link>
        </header>

        <Tabs
          ariaLabel={`${themeId === "fashion-atelier" ? "Fashion Atelier" : "Vibrant Editorial"} theme settings`}
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: "slideshow", label: "Slideshow" },
            { value: "typography", label: "Typography" },
            { value: "effects", label: "Image effects" },
          ]}
        />

        {notice ? <p role="status" className="erp-status-success">{notice}</p> : null}
        {error ? <p role="alert" className="erp-status-error">{error}</p> : null}

        {activeTab === "slideshow" ? (
          <div className="space-y-6">
            <Card className="space-y-5">
              <div>
                <h2 className="erp-card-title">Image slideshow</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Upload up to five JPEG, PNG, or WebP images. Each image can be up to 600 KB. Changes appear on the public store after saving.
                </p>
              </div>
            </Card>

            {presentation.slides.map((slide, index) => (
              <Card key={slide.id} className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="erp-card-title">Slide {index + 1}</h3>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setPresentation((current) => ({
                        ...current,
                        slides: current.slides.filter((entry) => entry.id !== slide.id),
                      }))}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                      Remove slide
                    </Button>
                  </div>
                  <Input
                    label="Headline"
                    value={slide.headline}
                    maxLength={120}
                    onChange={(event) => updateSlide(slide.id, { headline: event.target.value })}
                  />
                  <Input
                    label="Caption"
                    value={slide.caption}
                    maxLength={240}
                    onChange={(event) => updateSlide(slide.id, { caption: event.target.value })}
                  />
                  <Input
                    label="Upload image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hint="JPEG, PNG, or WebP · maximum 600 KB"
                    onChange={(event) => void updateSlideImage(event, slide.id)}
                  />
                </div>
                <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)]">
                  {slide.imageDataUrl ? (
                    <Image
                      src={slide.imageDataUrl}
                      alt={`Slide ${index + 1} preview`}
                      width={1280}
                      height={720}
                      unoptimized
                      className="h-full max-h-72 w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-[var(--erp-muted)]">
                      <ImagePlus aria-hidden="true" className="mx-auto" size={30} />
                      <p className="mt-2 text-sm">Choose an image to preview</p>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPresentation((current) => current.slides.length >= 5
                  ? current
                  : {
                      ...current,
                      slides: [...current.slides, {
                        id: crypto.randomUUID().replaceAll("-", ""),
                        imageDataUrl: "",
                        headline: "",
                        caption: "",
                      }],
                    })}
                disabled={presentation.slides.length >= 5}
              >
                <Plus aria-hidden="true" size={16} />
                Add slide
              </Button>
            </div>
          </div>
        ) : null}

        {activeTab === "typography" ? (
          <Card className="max-w-2xl space-y-5">
            <div>
              <h2 className="erp-card-title">Storefront typography</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Choose the type style used for your slideshow headlines and storefront content.
              </p>
            </div>
            <Select
              label="Font family"
              value={presentation.fontFamily}
              onChange={(event) => setPresentation((current) => ({
                ...current,
                fontFamily: event.target.value as OnlineStorePresentation["fontFamily"],
              }))}
            >
              <option value="sans">Modern sans</option>
              <option value="serif">Editorial serif</option>
              <option value="rounded">Rounded</option>
            </Select>
          </Card>
        ) : null}

        {activeTab === "effects" ? (
          <Card className="max-w-2xl space-y-5">
            <div>
              <h2 className="erp-card-title">Image treatment</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Adjust the slideshow image blur from 0 to 20 pixels.
              </p>
            </div>
            <Input
              label={`Image blur · ${presentation.blur}px`}
              type="range"
              min={0}
              max={20}
              step={1}
              value={presentation.blur}
              onChange={(event) => setPresentation((current) => ({
                ...current,
                blur: Number(event.target.value),
              }))}
            />
          </Card>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" onClick={() => void savePresentation()} disabled={saving}>
            {saving ? "Saving..." : "Save theme settings"}
          </Button>
        </div>
      </Section>
    </Page>
  );
}
