import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadQuickCreateLookupOptions,
  mergeQuickCreateLookupOptions,
} from "./quick-create-lookup-options";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadQuickCreateLookupOptions", () => {
  it("loads independent option lists in parallel and returns them by master key", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify([
      { id: String(input).endsWith("/brand") ? "brand-1" : "category-1", label: "Option" },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const options = await loadQuickCreateLookupOptions("org/id", ["brand", "category"], new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/organizations/org%2Fid/master-data/brand",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(options).toEqual({
      brand: [{ id: "brand-1", label: "Option" }],
      category: [{ id: "category-1", label: "Option" }],
    });

  });

  it("cancels all lookup requests when the active quick-create flow closes", async () => {
    const abortSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("Expected the lookup request to receive an abort signal."));
        return;
      }
      abortSignals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const pendingOptions = loadQuickCreateLookupOptions("org-1", ["brand", "measurement-chart"], controller.signal);
    controller.abort();

    await expect(pendingOptions).rejects.toMatchObject({ name: "AbortError" });
    expect(abortSignals).toHaveLength(2);
    expect(abortSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it("reports lookup errors instead of silently returning empty options", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Lookup unavailable" }), { status: 503 })));

    await expect(loadQuickCreateLookupOptions("org-1", ["brand"], new AbortController().signal))
      .rejects.toThrow("Lookup unavailable");
  });
});

describe("mergeQuickCreateLookupOptions", () => {
  it("retains newly created options when the parent lookup refresh completes", () => {
    const createdOption = { id: "new-type", label: "New Type" };

    expect(mergeQuickCreateLookupOptions(
      { "product-master": [createdOption] },
      { "product-master": [{ id: "existing-type", label: "Existing Type" }] },
    )).toEqual({
      "product-master": [
        { id: "existing-type", label: "Existing Type" },
        createdOption,
      ],
    });
  });

  it("prefers refreshed records when an option already exists", () => {
    expect(mergeQuickCreateLookupOptions(
      { brand: [{ id: "brand-1", label: "Old Label" }] },
      { brand: [{ id: "brand-1", label: "Current Label" }] },
    )).toEqual({
      brand: [{ id: "brand-1", label: "Current Label" }],
    });
  });
});
