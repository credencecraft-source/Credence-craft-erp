import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PosPage from "./pos-page";

describe("POS home page", () => {
  it("opens the Online Store in a separate tab", async () => {
    const markup = renderToStaticMarkup(await PosPage({
      params: Promise.resolve({ workspaceId: "workspace-1", organizationId: "org-1" }),
    }));

    expect(markup).toContain('href="/dashboard/workspace-1/organizations/org-1/pos/online-store"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});
