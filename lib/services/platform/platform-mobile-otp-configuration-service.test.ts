import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  alternativeFindUniqueMock,
  alternativeUpsertMock,
  auditCreateMock,
  findUniqueMock,
  prismaMock,
  requirePlatformSessionAdminMock,
  transactionMock,
  upsertMock,
} = vi.hoisted(() => {
  const transactionMock = {
    platformMobileOtpConfiguration: { upsert: vi.fn() },
    platformAlternativeMobileOtpConfiguration: { upsert: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
  };
  const findUniqueMock = vi.fn();
  const alternativeFindUniqueMock = vi.fn();
  return {
    alternativeFindUniqueMock,
    alternativeUpsertMock:
      transactionMock.platformAlternativeMobileOtpConfiguration.upsert,
    auditCreateMock: transactionMock.platformAuditEvent.create,
    findUniqueMock,
    prismaMock: {
      $transaction: vi.fn(),
      platformMobileOtpConfiguration: { findUnique: findUniqueMock },
      platformAlternativeMobileOtpConfiguration: {
        findUnique: alternativeFindUniqueMock,
      },
    },
    requirePlatformSessionAdminMock: vi.fn(),
    transactionMock,
    upsertMock: transactionMock.platformMobileOtpConfiguration.upsert,
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import {
  getPlatformMobileOtpConfiguration,
  getPlatformAlternativeMobileOtpConfiguration,
  getPlatformMobileOtpWidgetClientConfiguration,
  savePlatformAlternativeMobileOtpConfiguration,
  savePlatformMobileOtpConfiguration,
  verifyPlatformMobileOtpAccessToken,
} from "./platform-mobile-otp-configuration-service";

describe("platform mobile OTP configuration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_SECRET", "test-auth-secret");
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-id" });
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof transactionMock) => Promise<unknown>) =>
        callback(transactionMock),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires all credentials when configuring MSG91 for the first time", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      savePlatformMobileOtpConfiguration({
        widgetId: "widget-123",
        tokenAuth: "token-auth",
      }),
    ).rejects.toThrow(
      "MSG91 tokenAuth and server Auth Key are required for initial setup.",
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("requires a platform admin before reading configuration", async () => {
    requirePlatformSessionAdminMock.mockRejectedValue(new Error("Unauthorized."));

    await expect(getPlatformMobileOtpConfiguration()).rejects.toThrow(
      "Unauthorized.",
    );
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("stores secrets encrypted and returns only credential-presence metadata", async () => {
    findUniqueMock.mockResolvedValue(null);
    upsertMock.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        updated_at: new Date("2026-10-04T00:00:00.000Z"),
      }),
    );

    const result = await savePlatformMobileOtpConfiguration({
      widgetId: "widget-123",
      tokenAuth: "client-token",
      authKey: "server-key",
    });
    const createData = upsertMock.mock.calls[0][0].create;

    expect(createData.token_auth_encrypted).not.toBe("client-token");
    expect(createData.auth_key_encrypted).not.toBe("server-key");
    expect(decryptSecret(createData.token_auth_encrypted)).toBe("client-token");
    expect(decryptSecret(createData.auth_key_encrypted)).toBe("server-key");
    expect(auditCreateMock).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "admin-id",
        action: "SAVE",
        entity_type: "PLATFORM_MOBILE_OTP_CONFIGURATION",
        entity_id: "default",
        details: {
          widgetId: "widget-123",
          tokenAuthUpdated: true,
          authKeyUpdated: true,
        },
      },
    });
    expect(result).toEqual({
      widgetId: "widget-123",
      hasTokenAuth: true,
      hasAuthKey: true,
      updatedAt: new Date("2026-10-04T00:00:00.000Z"),
    });
  });

  it("keeps stored secrets when secret inputs are left blank", async () => {
    const existing = {
      id: "default",
      widget_id: "old-widget",
      token_auth_encrypted: encryptSecret("existing-token"),
      auth_key_encrypted: encryptSecret("existing-key"),
      created_at: new Date(),
      updated_at: new Date(),
    };
    findUniqueMock.mockResolvedValue(existing);
    upsertMock.mockResolvedValue({ ...existing, widget_id: "new-widget" });

    await savePlatformMobileOtpConfiguration({
      widgetId: "new-widget",
      tokenAuth: "",
      authKey: "",
    });

    expect(upsertMock.mock.calls[0][0].update).toEqual({
      widget_id: "new-widget",
      token_auth_encrypted: existing.token_auth_encrypted,
      auth_key_encrypted: existing.auth_key_encrypted,
    });
  });

  it("does not expose encrypted secrets when reading configuration", async () => {
    findUniqueMock.mockResolvedValue({
      id: "default",
      widget_id: "widget-123",
      token_auth_encrypted: encryptSecret("client-token"),
      auth_key_encrypted: encryptSecret("server-key"),
      created_at: new Date(),
      updated_at: new Date("2026-10-04T00:00:00.000Z"),
    });

    const result = await getPlatformMobileOtpConfiguration();

    expect(result).toEqual({
      widgetId: "widget-123",
      hasTokenAuth: true,
      hasAuthKey: true,
      updatedAt: new Date("2026-10-04T00:00:00.000Z"),
    });
    expect(result).not.toHaveProperty("tokenAuth");
    expect(result).not.toHaveProperty("authKey");
  });

  it("returns only the widget credentials required by the browser", async () => {
    findUniqueMock.mockResolvedValue({
      id: "default",
      widget_id: "widget-123",
      token_auth_encrypted: encryptSecret("client-token"),
      auth_key_encrypted: encryptSecret("server-key"),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      getPlatformMobileOtpWidgetClientConfiguration(),
    ).resolves.toEqual({
      widgetId: "widget-123",
      tokenAuth: "client-token",
    });
  });

  it("stores alternative API keys encrypted and returns only URL and presence metadata", async () => {
    alternativeFindUniqueMock.mockResolvedValue(null);
    alternativeUpsertMock.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
      }),
    );

    await expect(
      savePlatformAlternativeMobileOtpConfiguration({
        apiUrl: "https://example.com/profile",
        apiKey: "secret-api-key",
      }),
    ).resolves.toEqual({
      apiUrl: "https://example.com/profile",
      hasApiKey: true,
    });

    const createData = alternativeUpsertMock.mock.calls[0][0].create;
    expect(createData.api_key_encrypted).not.toBe("secret-api-key");
    expect(
      decryptSecret(createData.api_key_encrypted as string),
    ).toBe("secret-api-key");
    expect(auditCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: {
          provider: "alternative-api",
          apiUrlUpdated: true,
          apiKeyUpdated: true,
        },
      }),
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("keeps the existing alternative API key when the replacement input is blank", async () => {
    const existing = {
      id: "default",
      api_url: "https://old.example.com/profile",
      api_key_encrypted: encryptSecret("existing-api-key"),
      created_at: new Date(),
      updated_at: new Date(),
    };
    alternativeFindUniqueMock.mockResolvedValue(existing);
    alternativeUpsertMock.mockResolvedValue({
      ...existing,
      api_url: "https://new.example.com/profile",
    });

    await savePlatformAlternativeMobileOtpConfiguration({
      apiUrl: "https://new.example.com/profile",
      apiKey: "",
    });

    expect(alternativeUpsertMock.mock.calls[0][0].update).toEqual({
      api_url: "https://new.example.com/profile",
      api_key_encrypted: existing.api_key_encrypted,
    });
  });

  it("requires HTTPS and an initial API key for the alternative provider", async () => {
    alternativeFindUniqueMock.mockResolvedValue(null);

    await expect(
      savePlatformAlternativeMobileOtpConfiguration({
        apiUrl: "http://example.com/profile",
        apiKey: "secret-api-key",
      }),
    ).rejects.toThrow("Alternative mobile API URL must be a valid HTTPS URL.");
    await expect(
      savePlatformAlternativeMobileOtpConfiguration({
        apiUrl: "https://example.com/profile",
      }),
    ).rejects.toThrow("Alternative mobile API key is required for initial setup.");
    expect(alternativeUpsertMock).not.toHaveBeenCalled();
  });

  it("does not expose the saved alternative API key", async () => {
    alternativeFindUniqueMock.mockResolvedValue({
      id: "default",
      api_url: "https://example.com/profile",
      api_key_encrypted: encryptSecret("secret-api-key"),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      getPlatformAlternativeMobileOtpConfiguration(),
    ).resolves.toEqual({
      apiUrl: "https://example.com/profile",
      hasApiKey: true,
    });
  });

  it("trusts only the phone returned by MSG91 access-token verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "success", message: "919876543210" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    findUniqueMock.mockResolvedValue({
      id: "default",
      widget_id: "widget-123",
      token_auth_encrypted: encryptSecret("client-token"),
      auth_key_encrypted: encryptSecret("server-key"),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      verifyPlatformMobileOtpAccessToken("header.payload.signature"),
    ).resolves.toBe("919876543210");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://control.msg91.com/api/v5/widget/verifyAccessToken",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          authkey: "server-key",
          "access-token": "header.payload.signature",
        }),
      }),
    );
  });

  it("rejects provider failures and invalid access tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "error", message: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    findUniqueMock.mockResolvedValue({
      id: "default",
      widget_id: "widget-123",
      token_auth_encrypted: encryptSecret("client-token"),
      auth_key_encrypted: encryptSecret("server-key"),
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(
      verifyPlatformMobileOtpAccessToken("not-a-jwt"),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      verifyPlatformMobileOtpAccessToken("header.payload.signature"),
    ).resolves.toBeNull();
  });
});
