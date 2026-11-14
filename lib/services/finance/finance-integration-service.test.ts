import { FinanceExternalProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    financeIntegrationConfig: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth/secret-cryptography", () => ({
  decryptSecret: (value: string) => value.replace("encrypted:", ""),
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

import { getFinanceIntegrationConfig } from "@/lib/services/finance/finance-integration-service";
import { saveFinanceIntegrationConfig } from "@/lib/services/finance/finance-integration-service";

describe("getFinanceIntegrationConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes by organization and returns credential-presence flags, never secret values", async () => {
    mocks.findUnique.mockResolvedValue({
      organization_id: "org-internal-A",
      active_provider: FinanceExternalProvider.ZOHO_BOOKS,
      auto_sync: true,
      tally_server_url: null,
      tally_company_name: null,
      zoho_api_region: "IN",
      zoho_organization_id: "123456789",
      zoho_client_id_encrypted: "encrypted-client-id",
      zoho_client_secret_encrypted: "encrypted-client-secret",
      zoho_refresh_token_encrypted: "encrypted-refresh-token",
      ledger_mappings: { zohoBooks: { vendorIdByPartyId: {} } },
      updated_by_user_id: "user-1",
      created_at: new Date("2026-11-18T00:00:00.000Z"),
      updated_at: new Date("2026-11-18T01:00:00.000Z"),
    });

    const config = await getFinanceIntegrationConfig("org-internal-A");

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { organization_id: "org-internal-A" } });
    expect(config).toMatchObject({
      activeProvider: FinanceExternalProvider.ZOHO_BOOKS,
      autoSync: true,
      hasZohoClientId: true,
      hasZohoClientSecret: true,
      hasZohoRefreshToken: true,
    });
    expect(JSON.stringify(config)).not.toContain("encrypted-client");
    expect(JSON.stringify(config)).not.toContain("encrypted-refresh");
    expect(config).not.toHaveProperty("zohoClientSecret");
    expect(config).not.toHaveProperty("zohoRefreshToken");
  });
});

describe("saveFinanceIntegrationConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      ...create,
      created_at: new Date("2026-11-14T00:00:00.000Z"),
      updated_at: new Date("2026-11-14T00:00:00.000Z"),
    }));
    mocks.auditCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      financeIntegrationConfig: { upsert: mocks.upsert },
      auditEvent: { create: mocks.auditCreate },
    }));
  });

  it("saves Zoho credentials encrypted and returns only masked credential flags", async () => {
    const config = await saveFinanceIntegrationConfig("org-internal-A", "user-1", {
      activeProvider: FinanceExternalProvider.ZOHO_BOOKS,
      autoSync: false,
      zohoApiRegion: "IN",
      zohoOrganizationId: "123456789",
      zohoClientId: "mock-client-id",
      zohoClientSecret: "mock-client-secret",
      zohoRefreshToken: "mock-refresh-token",
      ledgerMappings: {},
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal-A" },
      create: expect.objectContaining({
        zoho_client_id_encrypted: "encrypted:mock-client-id",
        zoho_client_secret_encrypted: "encrypted:mock-client-secret",
        zoho_refresh_token_encrypted: "encrypted:mock-refresh-token",
      }),
    }));
    expect(config).toMatchObject({
      activeProvider: FinanceExternalProvider.ZOHO_BOOKS,
      hasZohoClientId: true,
      hasZohoClientSecret: true,
      hasZohoRefreshToken: true,
    });
    expect(JSON.stringify(config)).not.toContain("mock-client-secret");
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });

  it("rejects a malformed Zoho organization ID before writing configuration", async () => {
    await expect(saveFinanceIntegrationConfig("org-internal-A", "user-1", {
      activeProvider: FinanceExternalProvider.ZOHO_BOOKS,
      autoSync: false,
      zohoApiRegion: "IN",
      zohoOrganizationId: "not-numeric",
      zohoClientId: "mock-client-id",
      zohoClientSecret: "mock-client-secret",
      zohoRefreshToken: "mock-refresh-token",
    })).rejects.toThrow("Zoho organization ID must contain digits only.");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
