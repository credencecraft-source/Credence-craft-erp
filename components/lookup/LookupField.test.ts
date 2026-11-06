import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrganizationMasterLookupLoader } from "./LookupField";

describe("createOrganizationMasterLookupLoader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a tenant-authorized, 20-row select page and returns only id/label pairs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        ...Array.from({ length: 22 }, (_, index) => ({ id: `record-${index}`, label: `Label ${index}`, private: "excluded" })),
        { id: 8, label: "invalid" },
      ],
      hasMore: true,
      nextCursor: "record-19",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const loader = createOrganizationMasterLookupLoader("public-org", "raw-material");

    const options = await loader("cotton", signal);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const query = new URL(requestUrl, "http://localhost").searchParams;
    expect(query.get("limit")).toBe("20");
    expect(query.get("page")).toBe("true");
    expect(query.get("shape")).toBe("select");
    expect(query.get("includeInactive")).toBe("false");
    expect(query.get("search")).toBe("cotton");
    expect(requestInit.signal).toBe(signal);
    expect(options).toHaveLength(20);
    expect(options[0]).toEqual({ id: "record-0", label: "Label 0" });
    expect(options[0]).not.toHaveProperty("private");
  });

  it("rejects unsuccessful lookup responses with a sanitized error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Lookup unavailable." }),
      { status: 503 },
    )));
    const loader = createOrganizationMasterLookupLoader("public-org", "vendor");

    await expect(loader("", new AbortController().signal)).rejects.toThrow("Unable to load lookup options.");
  });
});
