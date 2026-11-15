import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PosOnlineStorefront from "./pos-online-storefront";
import { DEFAULT_ONLINE_STORE_PRESENTATION } from "@/lib/services/pos/public-online-store-service";

describe("public POS storefront header", () => {
  it("places location and search in the header with a cart link and item count", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStorefront
        storeKey={"a".repeat(43)}
        storeName="Public Boutique"
        presentation={DEFAULT_ONLINE_STORE_PRESENTATION}
      />,
    );
    const header = markup.match(/<nav aria-label="Store navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const collection = markup.slice(markup.indexOf('id="collection"'));

    expect(header).toContain("Shop location");
    expect(header).toContain("Search the collection");
    expect(header).toContain("Your bag");
    expect(header).toContain("Your bag · 0");
    expect(header).toContain('href="/store/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cart"');
    expect(header.match(/sm:w-56/g)).toHaveLength(2);
    expect(header.match(/h-9 rounded-lg px-3 py-1\.5/g)).toHaveLength(2);
    expect(collection).not.toContain("Shop location");
    expect(collection).not.toContain("Search the collection");
    expect(collection).not.toContain("Shopping bag");
    expect(markup).not.toContain('aria-controls="shopping-bag"');
    expect(markup).not.toContain("Good finds, ready when you are.");
    expect(markup).not.toContain('aria-label="Store slideshow"');
  });

  it("renders a dedicated cart route with billing fields and an order summary", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStorefront
        storeKey={"a".repeat(43)}
        storeName="Public Boutique"
        presentation={DEFAULT_ONLINE_STORE_PRESENTATION}
        view="cart"
      />,
    );

    expect(markup).toContain("Shopping bag");
    expect(markup).toContain("Your bag · 0");
    expect(markup).toContain("Loading your shopping bag");
    expect(markup).not.toContain("Search the collection");
    expect(markup).not.toContain("The collection");
  });

  it("keeps navigation on the custom domain host", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStorefront
        storeKey={"a".repeat(43)}
        storeName="Public Boutique"
        presentation={DEFAULT_ONLINE_STORE_PRESENTATION}
        basePath="/"
      />,
    );
    const header = markup.match(/<nav aria-label="Store navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(header).toContain('href="/cart"');
    expect(header).not.toContain("/store/");
  });

  it("renders the uploaded image slideshow instead of the text-only hero", () => {
    const markup = renderToStaticMarkup(
      <PosOnlineStorefront
        storeKey={"a".repeat(43)}
        storeName="Public Boutique"
        presentation={{
          ...DEFAULT_ONLINE_STORE_PRESENTATION,
          fontFamily: "serif",
          blur: 4,
          themeId: "fashion-atelier",
          slides: [
            { id: "slide-one", imageDataUrl: "data:image/png;base64,test", headline: "First story", caption: "New arrivals" },
            { id: "slide-two", imageDataUrl: "data:image/png;base64,test", headline: "Second story", caption: "Made for today" },
          ],
        }}
      />,
    );

    expect(markup).toContain('aria-label="Store slideshow"');
    expect(markup).toContain('data-theme="fashion-atelier"');
    expect(markup).toContain("First story");
    expect(markup).toContain('aria-label="Previous slide"');
    expect(markup).toContain('aria-label="Next slide"');
    expect(markup).not.toContain("Good finds, ready when you are.");
  });
});
