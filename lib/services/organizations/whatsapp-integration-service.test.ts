import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  masterModuleFindMany: vi.fn(),
  masterModuleValueFindFirst: vi.fn(),
  masterModuleValueFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    masterModule: { findMany: mocks.masterModuleFindMany },
    masterModuleValue: {
      findFirst: mocks.masterModuleValueFindFirst,
      findMany: mocks.masterModuleValueFindMany,
    },
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import {
  getOrganizationWhatsAppIntegration,
  normalizeOrganizationWhatsAppSettings,
  normalizeOrganizationWhatsAppTemplate,
} from "./whatsapp-integration-service";

describe("organization WhatsApp integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationForUser.mockResolvedValue({
      id: "internal-org-1",
      organization_name: "Organization One",
    });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  });

  it("normalizes the provider settings without changing provider-specific identifiers", () => {
    expect(normalizeOrganizationWhatsAppSettings({
      apiKey: "  secret-key  ",
      namespace: "ns_ABC-9",
      isActive: true,
    })).toEqual({
      apiKey: "secret-key",
      namespace: "ns_ABC-9",
      isActive: true,
    });
  });

  it("rejects malformed MSG91 namespace and overlong API keys", () => {
    expect(() => normalizeOrganizationWhatsAppSettings({
      apiKey: "",
      namespace: "invalid namespace",
      isActive: false,
    })).toThrow("Enter a valid MSG91 template namespace.");
    expect(() => normalizeOrganizationWhatsAppSettings({
      apiKey: "x".repeat(2501),
      namespace: "valid_namespace",
      isActive: false,
    })).toThrow("MSG91 API key must be 2500 characters or fewer.");
  });

  it("validates template numbers, image URLs, and language while preserving exact template text", () => {
    expect(normalizeOrganizationWhatsAppTemplate({
      templateName: "order_ready",
      sampleTemplateText: "Your Order {{1}} Is Ready",
      integratedNumber: "+91 (98765) 43210",
      imageUrl: "https://cdn.example.com/header.png",
      languageCode: "en_IN",
      isActive: true,
    })).toEqual({
      templateName: "order_ready",
      sampleTemplateText: "Your Order {{1}} Is Ready",
      integratedNumber: "+919876543210",
      imageUrl: "https://cdn.example.com/header.png",
      languageCode: "en_IN",
      isActive: true,
    });
    expect(() => normalizeOrganizationWhatsAppTemplate({
      templateName: "order_ready",
      sampleTemplateText: "Ready",
      integratedNumber: "123",
      imageUrl: "",
      languageCode: "en",
      isActive: true,
    })).toThrow("Enter the MSG91 integrated WhatsApp number with country code.");
  });

  it("loads settings and templates only through the authorized organization's internal scope", async () => {
    mocks.masterModuleFindMany.mockResolvedValue([
      { id: "config-module-1", module_key: "whatsapp-integration-configuration" },
      { id: "template-module-1", module_key: "whatsapp-integration-templates" },
    ]);
    mocks.masterModuleValueFindFirst.mockResolvedValue({
      metadata: {
        kind: "configuration",
        apiKeyEncrypted: "encrypted-api-key",
        namespace: "org_namespace",
        isActive: true,
      },
      is_active: true,
    });
    mocks.masterModuleValueFindMany.mockResolvedValue([
      {
        id: "template-1",
        label: "order_ready",
        is_active: true,
        metadata: {
          kind: "template",
          sampleTemplateText: "Order ready",
          integratedNumber: "+919876543210",
          imageUrl: "",
          languageCode: "en",
        },
      },
    ]);

    await expect(getOrganizationWhatsAppIntegration("workspace-user-1", "public-org-1"))
      .resolves.toMatchObject({
        settings: { hasApiKey: true, namespace: "org_namespace", isActive: true },
        templates: [{ id: "template-1", templateName: "order_ready" }],
      });

    expect(mocks.getOrganizationForUser).toHaveBeenCalledWith("workspace-user-1", "public-org-1");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "workspace-user-1",
      "internal-org-1",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.masterModuleFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "internal-org-1" }),
    }));
    expect(mocks.masterModuleValueFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        module_id: "config-module-1",
        module: { organization_id: "internal-org-1" },
      }),
    }));
    expect(mocks.masterModuleValueFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        module_id: "template-module-1",
        module: { organization_id: "internal-org-1" },
      }),
    }));
  });
});
