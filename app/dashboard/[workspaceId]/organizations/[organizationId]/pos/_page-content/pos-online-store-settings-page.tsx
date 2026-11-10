"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Link2, Palette, Store } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";
import type { OnlineStorePresentation } from "@/lib/services/pos/public-online-store-service";
import storefrontStyles from "@/components/public/pos-online-storefront.module.css";
import PosOnlineStoreDomainSettingsPanel from "./pos-online-store-domain-settings-panel";

const AVAILABLE_THEMES: Array<{
  id: OnlineStorePresentation["themeId"];
  name: string;
  description: string;
  previewClass: string;
  headline: string;
  tone: string;
}> = [
  {
    id: "vibrant-editorial",
    name: "Vibrant editorial",
    description: "An expressive image-led storefront with berry, coral, and citrus colors.",
    previewClass: storefrontStyles.themeVibrant,
    headline: "Find your next favorite",
    tone: "Bright · expressive · modern",
  },
  {
    id: "fashion-atelier",
    name: "Fashion atelier",
    description: "A refined fashion-inspired storefront with forest, warm ivory, and muted bronze tones.",
    previewClass: storefrontStyles.themeFashion,
    headline: "The art of getting dressed",
    tone: "Editorial · natural · refined",
  },
];

export default function PosOnlineStoreSettingsPage({
  workspaceId,
  organizationId,
  initialEnabled,
  initialPublicPath,
  initialPresentation,
  initialTab = "general",
}: {
  workspaceId: string;
  organizationId: string;
  initialEnabled: boolean;
  initialPublicPath: string | null;
  initialPresentation: OnlineStorePresentation;
  initialTab?: "general" | "theme" | "domains";
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [publicPath, setPublicPath] = useState(initialPublicPath);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"general" | "theme" | "domains">(initialTab);
  const [presentation, setPresentation] = useState(initialPresentation);

  const chooseTheme = async (themeId: OnlineStorePresentation["themeId"]) => {
    if (saving || presentation.themeId === themeId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/online-store`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presentation: { ...presentation, themeId } }),
        },
      );
      const data = await response.json() as { presentation?: OnlineStorePresentation; error?: string };
      if (!response.ok || !data.presentation) {
        throw new Error(data.error || "Unable to apply this storefront theme.");
      }
      setPresentation(data.presentation);
      setNotice(`${AVAILABLE_THEMES.find((theme) => theme.id === themeId)?.name ?? "Storefront"} theme applied.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to apply this storefront theme.");
    } finally {
      setSaving(false);
    }
  };

  const updateEnabled = async () => {
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
          body: JSON.stringify({ enabled: !enabled }),
        },
      );
      const data = await response.json() as {
        enabled?: boolean;
        publicPath?: string | null;
        error?: string;
      };
      if (!response.ok || typeof data.enabled !== "boolean") {
        throw new Error(data.error || "Unable to update the public store.");
      }
      setEnabled(data.enabled);
      setPublicPath(data.publicPath ?? null);
      setNotice(data.enabled ? "Your public storefront is live." : "Your public storefront has been turned off.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update the public store.");
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = async () => {
    if (!publicPath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setNotice("Public storefront link copied.");
      setError("");
    } catch {
      setError("Unable to copy the storefront link. Copy it from the address bar instead.");
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2"><Store aria-hidden="true" size={16} /> POS Online Store</p>
            <h1 className="erp-page-heading mt-1">Online store settings</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Control storefront visibility, appearance, and custom-domain routing.
            </p>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/pos`}
            className="text-sm font-semibold text-[var(--erp-brand)]"
          >
            Back to POS
          </Link>
        </header>

        <Tabs
          ariaLabel="Online store settings"
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: "general", label: "General settings" },
            { value: "theme", label: "Theme" },
            { value: "domains", label: "Domains" },
          ]}
        />

        {notice ? <p role="status" className="erp-status-success">{notice}</p> : null}
        {error ? <p role="alert" className="erp-status-error">{error}</p> : null}

        {activeTab === "general" ? (
          <Card className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="erp-card-title">{enabled ? "Your store is public" : "Your store is private"}</h2>
                <Badge>{enabled ? "Published" : "Not published"}</Badge>
              </div>
              <p className="text-sm text-[var(--erp-muted)]">
                {enabled
                  ? "Anyone with the private link can browse eligible in-stock items and place an order. Turning the store off immediately disables its link."
                  : "Publishing creates a private, unguessable link. Share it only with customers you intend to reach."}
              </p>
            </div>

            {enabled && publicPath ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void copyPublicLink()}>
                  <Link2 aria-hidden="true" size={16} />
                  Copy public link
                </Button>
                <a
                  href={publicPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm transition-colors hover:bg-[var(--erp-surface-soft)]"
                >
                  <ExternalLink aria-hidden="true" size={16} />
                  Preview store
                </a>
              </div>
            ) : null}

            <Button
              type="button"
              variant={enabled ? "destructive" : "primary"}
              onClick={() => void updateEnabled()}
              disabled={saving}
            >
              {saving ? "Saving..." : enabled ? "Turn off public store" : "Publish public store"}
            </Button>
          </Card>
        ) : null}

        {activeTab === "theme" ? (
          <div className="space-y-4">
            <div>
              <h2 className="erp-card-title">Storefront themes</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Choose a storefront look and customize its presentation.
              </p>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              {AVAILABLE_THEMES.map((theme) => (
                <Card key={theme.id} className="space-y-5">
                  <div className={`${storefrontStyles.themePreview} ${theme.previewClass}`} aria-hidden="true">
                    <div className={storefrontStyles.themePreviewContent}>
                      <div className="flex items-center justify-between">
                        <span className={storefrontStyles.themePreviewLabel}>YOUR STORE</span>
                        <span className={storefrontStyles.themePreviewLabel}>COLLECTION</span>
                      </div>
                      <div>
                        <p className={storefrontStyles.themePreviewLabel}>New season</p>
                        <p className="mt-2 max-w-xs font-serif text-3xl font-semibold">{theme.headline}</p>
                      </div>
                      <p className={storefrontStyles.themePreviewLabel}>{theme.tone}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="erp-card-title">{theme.name}</h3>
                      {presentation.themeId === theme.id ? <Badge>Active theme</Badge> : null}
                    </div>
                    <p className="text-sm text-[var(--erp-muted)]">{theme.description}</p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant={presentation.themeId === theme.id ? "secondary" : "primary"}
                        onClick={() => void chooseTheme(theme.id)}
                        disabled={saving || presentation.themeId === theme.id}
                      >
                        {presentation.themeId === theme.id ? "Currently selected" : saving ? "Applying..." : "Use this theme"}
                      </Button>
                      <Link
                        href={`/dashboard/${workspaceId}/organizations/${organizationId}/pos/online-store/manage/themes/${theme.id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm transition-colors hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
                      >
                        <Palette aria-hidden="true" size={16} />
                        Customize
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {enabled && publicPath ? (
              <a href={publicPath} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3.5 py-2 text-sm font-semibold text-[var(--erp-text)] shadow-sm transition-colors hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2">
                <ExternalLink aria-hidden="true" size={16} />
                Preview storefront
              </a>
            ) : null}
          </div>
        ) : null}

        {activeTab === "domains" ? (
          <PosOnlineStoreDomainSettingsPanel organizationId={organizationId} storeEnabled={enabled} />
        ) : null}
      </Section>
    </Page>
  );
}
