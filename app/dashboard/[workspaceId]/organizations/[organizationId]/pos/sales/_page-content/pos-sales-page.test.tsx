import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PosSalesPage from "./pos-sales-page";

describe("POS Sales page", () => {
  it("renders the nested sales destinations for this workspace and organization", async () => {
    const markup = renderToStaticMarkup(await PosSalesPage({
      params: Promise.resolve({ workspaceId: "workspace-1", organizationId: "org-1" }),
    }));

    expect(markup).toContain("Sales");
    expect(markup).toContain('href="/dashboard/workspace-1/organizations/org-1/pos/sales/quick-invoice"');
    expect(markup).toContain('href="/dashboard/workspace-1/organizations/org-1/pos/sales/invoice"');
    expect(markup).toContain('href="/dashboard/workspace-1/organizations/org-1/pos/sales/sales-return"');
  });
});
