import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

const CONFIGURATION_ID = "default";

type MobileOtpConfigurationInput = {
  widgetId: string;
  tokenAuth?: string;
  authKey?: string;
};

type AlternativeMobileOtpConfigurationInput = {
  apiUrl: string;
  apiKey?: string;
};

function normalizeConfiguration(configuration: {
  widget_id: string;
  token_auth_encrypted: string;
  auth_key_encrypted: string;
  updated_at: Date;
} | null) {
  if (!configuration) return null;

  return {
    widgetId: configuration.widget_id,
    hasTokenAuth: Boolean(configuration.token_auth_encrypted),
    hasAuthKey: Boolean(configuration.auth_key_encrypted),
    updatedAt: configuration.updated_at,
  };
}

export async function getPlatformMobileOtpConfiguration() {
  await requirePlatformSessionAdmin();
  const configuration = await prisma.platformMobileOtpConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  return normalizeConfiguration(configuration);
}

export async function getPlatformMobileOtpWidgetClientConfiguration() {
  const configuration = await prisma.platformMobileOtpConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  if (!configuration) return null;

  return {
    widgetId: configuration.widget_id,
    tokenAuth: decryptSecret(configuration.token_auth_encrypted),
  };
}

export async function getPlatformAlternativeMobileOtpConfiguration() {
  await requirePlatformSessionAdmin();
  const configuration =
    await prisma.platformAlternativeMobileOtpConfiguration.findUnique({
      where: { id: CONFIGURATION_ID },
    });
  if (!configuration) return null;

  return {
    apiUrl: configuration.api_url,
    hasApiKey: Boolean(configuration.api_key_encrypted),
  };
}

export async function savePlatformAlternativeMobileOtpConfiguration(
  input: AlternativeMobileOtpConfigurationInput,
) {
  const admin = await requirePlatformSessionAdmin();
  const apiUrl = input.apiUrl.trim();
  const apiKey = input.apiKey?.trim() ?? "";

  if (!apiUrl) {
    throw new Error("Alternative mobile API URL is required.");
  }
  if (apiUrl.length > 2048) {
    throw new Error("Alternative mobile API URL must be 2048 characters or fewer.");
  }

  let parsedApiUrl: URL;
  try {
    parsedApiUrl = new URL(apiUrl);
  } catch {
    throw new Error("Alternative mobile API URL must be a valid HTTPS URL.");
  }
  if (
    parsedApiUrl.protocol !== "https:" ||
    parsedApiUrl.username ||
    parsedApiUrl.password
  ) {
    throw new Error("Alternative mobile API URL must be a valid HTTPS URL.");
  }
  if (apiKey.length > 2500) {
    throw new Error("Alternative mobile API key must be 2500 characters or fewer.");
  }

  const current =
    await prisma.platformAlternativeMobileOtpConfiguration.findUnique({
      where: { id: CONFIGURATION_ID },
    });
  const encryptedApiKey = apiKey
    ? encryptSecret(apiKey)
    : current?.api_key_encrypted;
  if (!encryptedApiKey) {
    throw new Error("Alternative mobile API key is required for initial setup.");
  }

  await prisma.$transaction(async (transaction) => {
    const savedConfiguration =
      await transaction.platformAlternativeMobileOtpConfiguration.upsert({
        where: { id: CONFIGURATION_ID },
        create: {
          id: CONFIGURATION_ID,
          api_url: apiUrl,
          api_key_encrypted: encryptedApiKey,
        },
        update: {
          api_url: apiUrl,
          api_key_encrypted: encryptedApiKey,
        },
      });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "SAVE",
        entity_type: "PLATFORM_MOBILE_OTP_CONFIGURATION",
        entity_id: savedConfiguration.id,
        details: {
          provider: "alternative-api",
          apiUrlUpdated: true,
          apiKeyUpdated: Boolean(apiKey),
        },
      },
    });
  });

  return { apiUrl, hasApiKey: true };
}

export async function verifyPlatformMobileOtpAccessToken(accessToken: string) {
  if (
    accessToken.length > 4096 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)
  ) {
    return null;
  }

  const configuration = await prisma.platformMobileOtpConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  if (!configuration) {
    throw new Error("MSG91 mobile OTP is not configured.");
  }

  const response = await fetch(
    "https://control.msg91.com/api/v5/widget/verifyAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authkey: decryptSecret(configuration.auth_key_encrypted),
        "access-token": accessToken,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  if (
    !response.ok ||
    !payload ||
    typeof payload !== "object" ||
    !("type" in payload) ||
    payload.type !== "success" ||
    !("message" in payload) ||
    typeof payload.message !== "string"
  ) {
    return null;
  }

  const mobileNumber = payload.message.trim().replace(/^\+/, "");
  return /^\d{7,15}$/.test(mobileNumber) ? mobileNumber : null;
}

export async function savePlatformMobileOtpConfiguration(
  input: MobileOtpConfigurationInput,
) {
  const admin = await requirePlatformSessionAdmin();
  const widgetId = input.widgetId.trim();
  const tokenAuth = input.tokenAuth?.trim() ?? "";
  const authKey = input.authKey?.trim() ?? "";

  if (!widgetId) {
    throw new Error("MSG91 Widget ID is required.");
  }
  if (widgetId.length > 255) {
    throw new Error("MSG91 Widget ID must be 255 characters or fewer.");
  }
  if (tokenAuth.length > 2500 || authKey.length > 2500) {
    throw new Error("MSG91 credentials must be 2500 characters or fewer.");
  }

  const current = await prisma.platformMobileOtpConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  if (!current && (!tokenAuth || !authKey)) {
    throw new Error("MSG91 tokenAuth and server Auth Key are required for initial setup.");
  }

  const encryptedTokenAuth = tokenAuth
    ? encryptSecret(tokenAuth)
    : current?.token_auth_encrypted;
  const encryptedAuthKey = authKey
    ? encryptSecret(authKey)
    : current?.auth_key_encrypted;

  if (!encryptedTokenAuth || !encryptedAuthKey) {
    throw new Error("MSG91 tokenAuth and server Auth Key are required for initial setup.");
  }

  const configuration = await prisma.$transaction(async (transaction) => {
    const savedConfiguration =
      await transaction.platformMobileOtpConfiguration.upsert({
        where: { id: CONFIGURATION_ID },
        create: {
          id: CONFIGURATION_ID,
          widget_id: widgetId,
          token_auth_encrypted: encryptedTokenAuth,
          auth_key_encrypted: encryptedAuthKey,
        },
        update: {
          widget_id: widgetId,
          token_auth_encrypted: encryptedTokenAuth,
          auth_key_encrypted: encryptedAuthKey,
        },
      });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "SAVE",
        entity_type: "PLATFORM_MOBILE_OTP_CONFIGURATION",
        entity_id: savedConfiguration.id,
        details: {
          widgetId,
          tokenAuthUpdated: Boolean(tokenAuth),
          authKeyUpdated: Boolean(authKey),
        },
      },
    });

    return savedConfiguration;
  });

  return normalizeConfiguration(configuration);
}
