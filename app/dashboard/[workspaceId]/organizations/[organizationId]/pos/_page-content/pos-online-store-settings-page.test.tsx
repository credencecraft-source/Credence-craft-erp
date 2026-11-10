import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PosOnlineStoreSettingsPage from "./pos-online-store-settings-page";
import PosOnlineStoreThemeEditorPage from "./pos-online-store-theme-editor-page";
import { DEFAULT_ONLINE_STORE_PRESENTATION } from "@/lib/services/pos/public-online-store-service";

describe("POS online store settings", () => {
  it("provides separate General settings and Theme areas", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStoreSettingsPage
        workspaceId="workspace"
        organizationId="organization"
        initialEnabled={false}
        initialPublicPath={null}
        initialPresentation={DEFAULT_ONLINE_STORE_PRESENTATION}
      />,
    );

    expect(markup).toContain("General settings");
    expect(markup).toContain("Theme");
    expect(markup).toContain("Publish public store");
    expect(markup).not.toContain("Store settings");
    expect(markup).not.toContain("Slideshow");
  });

  it("lists both themes and marks the selected theme", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStoreSettingsPage
        workspaceId="workspace"
        organizationId="organization"
        initialEnabled={false}
        initialPublicPath={null}
        initialPresentation={{
          ...DEFAULT_ONLINE_STORE_PRESENTATION,
          themeId: "fashion-atelier",
        }}
        initialTab="theme"
      />,
    );

    expect(markup).toContain("General settings");
    expect(markup).toContain("Vibrant editorial");
    expect(markup).toContain("Fashion atelier");
    expect(markup).toContain("forest, warm ivory, and muted bronze tones");
    expect(markup).toContain("Customize");
  });

  it("provides a separate custom domains settings tab", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStoreSettingsPage
        workspaceId="workspace"
        organizationId="organization"
        initialEnabled={true}
        initialPublicPath="/store/key"
        initialPresentation={DEFAULT_ONLINE_STORE_PRESENTATION}
        initialTab="domains"
      />,
    );

    expect(markup).toContain("Domains");
    expect(markup).toContain("Connect your own domain");
    expect(markup).toContain("Hosting integration");
    expect(markup).toContain("Vercel hosting &amp; HTTPS");
    expect(markup).toContain("Loading connected domains");
  });

  it("provides a dedicated theme editor with slideshow, typography, and effects", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStoreThemeEditorPage
        workspaceId="workspace"
        organizationId="organization"
        themeId="fashion-atelier"
        initialPresentation={DEFAULT_ONLINE_STORE_PRESENTATION}
      />,
    );

    expect(markup).toContain("Fashion Atelier theme");
    expect(markup).toContain("Slideshow");
    expect(markup).toContain("Typography");
    expect(markup).toContain("Image effects");
    expect(markup).toContain("Save theme settings");
    expect(markup).toContain("Add slide");
  });
});
