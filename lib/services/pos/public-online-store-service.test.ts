import { describe, expect, it } from "vitest";

import {
  DEFAULT_ONLINE_STORE_PRESENTATION,
  OnlineStoreDomainError,
  normalizeOnlineStoreHostname,
  parseOnlineStorePresentation,
} from "./public-online-store-service";

const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZtEAAAAASUVORK5CYII=";

describe("online-store slideshow settings", () => {
  it("accepts bounded image slides and normalizes user-entered copy", () => {
    expect(parseOnlineStorePresentation({
      fontFamily: "serif",
      blur: 6,
      themeId: "fashion-atelier",
      slides: [{
        id: "slide-1",
        imageDataUrl: onePixelPng,
        headline: "New arrivals",
        caption: "Shop the latest",
      }],
    })).toEqual({
      fontFamily: "serif",
      blur: 6,
      themeId: "fashion-atelier",
      slides: [{
        id: "slide-1",
        imageDataUrl: onePixelPng,
        headline: "NEW ARRIVALS",
        caption: "SHOP THE LATEST",
        }],
    });
  });

  it("allows an empty slideshow using the default presentation", () => {
    expect(parseOnlineStorePresentation(DEFAULT_ONLINE_STORE_PRESENTATION))
      .toEqual(DEFAULT_ONLINE_STORE_PRESENTATION);
  });

  it("uses the vibrant theme for legacy settings and accepts the fashion theme", () => {
    expect(parseOnlineStorePresentation({
      slides: [],
      fontFamily: "sans",
      blur: 0,
    }).themeId).toBe("vibrant-editorial");
    expect(parseOnlineStorePresentation({
      ...DEFAULT_ONLINE_STORE_PRESENTATION,
      themeId: "fashion-atelier",
    }).themeId).toBe("fashion-atelier");
  });

  it.each([
    [{ slides: [], fontFamily: "comic", blur: 0 }, "font"],
    [{ slides: [], fontFamily: "sans", blur: 21 }, "blur"],
    [{ slides: [], fontFamily: "sans", blur: 0, themeId: "unknown" }, "available storefront theme"],
    [{ slides: Array(6).fill({}), fontFamily: "sans", blur: 0 }, "five slides"],
    [{
      slides: [{ id: "bad-image", imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+", headline: "", caption: "" }],
      fontFamily: "sans",
      blur: 0,
    }, "JPEG, PNG, or WebP"],
    [{
      slides: [{ id: "bad-signature", imageDataUrl: "data:image/png;base64,YWJj", headline: "", caption: "" }],
      fontFamily: "sans",
      blur: 0,
    }, "does not match"],
  ])("rejects invalid slideshow input", (input, message) => {
    expect(() => parseOnlineStorePresentation(input)).toThrow(message);
  });
});

describe("online-store custom domain validation", () => {
  it("normalizes internationalized and case-insensitive hostnames", () => {
    expect(normalizeOnlineStoreHostname("  Shop.Example.COM. ")).toBe("shop.example.com");
    expect(normalizeOnlineStoreHostname("bücher.de")).toBe("xn--bcher-kva.de");
  });

  it.each([
    ["https://shop.example.com", "hostname only"],
    ["shop.example.com/path", "hostname only"],
    ["*.example.com", "hostname only"],
    ["127.0.0.1", "public domain"],
    ["localhost", "public domain"],
    ["shop.example.local", "public domain"],
    ["-shop.example.com", "public domain"],
    ["shop..example.com", "public domain"],
  ])("rejects unsafe or malformed hostname %s", (hostname, error) => {
    expect(() => normalizeOnlineStoreHostname(hostname)).toThrow(error);
  });

  it("returns status-safe validation errors", () => {
    try {
      normalizeOnlineStoreHostname("https://example.com");
      throw new Error("Expected invalid hostname to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(OnlineStoreDomainError);
      expect((error as OnlineStoreDomainError).status).toBe(400);
    }
  });
});
