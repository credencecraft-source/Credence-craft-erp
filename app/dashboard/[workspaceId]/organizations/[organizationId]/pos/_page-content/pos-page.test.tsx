import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PosPage from "./pos-page";

describe("POS home page", () => {
  it("does not surface the Online Store link on the POS landing page", async () => {
    const markup = renderToStaticMarkup(await PosPage({
      params: Promise.resolve({ workspaceId: "workspace-1", organizationId: "org-1" }),
    }));

    expect(markup).not.toContain("Online Store");
    expect(markup).not.toContain("/dashboard/workspace-1/organizations/org-1/pos/online-store");
  });
});
