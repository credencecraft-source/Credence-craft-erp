import { describe, expect, it } from "vitest";

import {
  getRequestOrigin,
  isSameOriginRequest,
} from "./same-origin-request";

describe("isSameOriginRequest", () => {
  const url = "https://erp.example.com/api/platform/workspace-users/user-1/support-access";

  it("uses the external host and protocol rather than an internal URL", () => {
    expect(
      getRequestOrigin(
        new Request("http://0.0.0.0:3000/api/platform/workspace-users/user-1/support-access", {
          headers: {
            host: "localhost:3000",
            "x-forwarded-proto": "http",
          },
        }),
      ),
    ).toBe("http://localhost:3000");
  });

  it("accepts a matching Origin header", () => {
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: { origin: "https://erp.example.com" },
        }),
      ),
    ).toBe(true);
  });

  it("uses the incoming Host when the framework request URL has an internal host", () => {
    expect(
      isSameOriginRequest(
        new Request("http://internal-next:3000/api/platform/workspace-users/user-1/support-access", {
          method: "POST",
          headers: {
            host: "erp.example.com",
            origin: "https://erp.example.com",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe(true);
  });

  it("uses a matching Referer when Origin is omitted", () => {
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: { referer: "https://erp.example.com/platform/workspace-users" },
        }),
      ),
    ).toBe(true);
  });

  it("uses same-origin fetch metadata when Origin and Referer are omitted", () => {
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
    expect(isSameOriginRequest(new Request(url, { method: "POST" }))).toBe(false);
  });

  it("rejects cross-origin requests", () => {
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            referer: "https://erp.example.com/platform/workspace-users",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: { referer: "https://attacker.example/" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects cross-site fetch metadata even with a matching Origin", () => {
    expect(
      isSameOriginRequest(
        new Request(url, {
          method: "POST",
          headers: {
            origin: "https://erp.example.com",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toBe(false);
  });
});
