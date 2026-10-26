import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import type { PlatformEmailConfiguration } from "@prisma/client";

import { decryptSecret, encryptSecret } from "@/lib/auth/secret-cryptography";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

const CONFIGURATION_ID = "default";
const OTP_COPY_RECIPIENT = "credencecraft@gmail.com";
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
export type OtpPurpose = "AUTH" | "SUPPORT" | "ORGANIZATION_EMAIL" | "MOBILE_LOGIN";

export class PlatformEmailConfigurationError extends Error {}

type EmailConfigurationInput = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
};

function otpHash(email: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured before using email OTP.");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function normalizeConfiguration(configuration: PlatformEmailConfiguration | null) {
  if (!configuration) return null;
  return {
    id: configuration.id,
    provider: configuration.provider,
    smtpHost: configuration.smtp_host,
    smtpPort: configuration.smtp_port,
    smtpSecure: configuration.smtp_secure,
    smtpUsername: configuration.smtp_username,
    fromEmail: configuration.from_email,
    fromName: configuration.from_name,
    isActive: configuration.is_active,
    sendAuthOtpToCredencecraft: configuration.send_auth_otp_to_credencecraft,
    hasPassword: Boolean(configuration.smtp_password_encrypted),
  };
}

export async function getPlatformEmailConfiguration() {
  return normalizeConfiguration(await prisma.platformEmailConfiguration.findUnique({ where: { id: CONFIGURATION_ID } }));
}

export async function getAuthOtpCopySetting() {
  await requirePlatformSessionAdmin();
  const configuration = await prisma.platformEmailConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
    select: { send_auth_otp_to_credencecraft: true },
  });
  return configuration?.send_auth_otp_to_credencecraft ?? false;
}

export async function setAuthOtpCopySetting(enabled: boolean) {
  const admin = await requirePlatformSessionAdmin();
  if (typeof enabled !== "boolean") {
    throw new PlatformEmailConfigurationError(
      "Select a valid OTP email copy setting.",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const configuration = await transaction.platformEmailConfiguration.findUnique({
      where: { id: CONFIGURATION_ID },
      select: { send_auth_otp_to_credencecraft: true },
    });
    if (!configuration) {
      if (enabled) {
        throw new PlatformEmailConfigurationError(
          "Configure platform email delivery before enabling OTP copies.",
        );
      }
      return false;
    }

    const previousValue = configuration.send_auth_otp_to_credencecraft;
    if (previousValue === enabled) return enabled;

    await transaction.platformEmailConfiguration.update({
      where: { id: CONFIGURATION_ID },
      data: { send_auth_otp_to_credencecraft: enabled },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "PLATFORM_AUTH_OTP_COPY_SETTING_UPDATED",
        entity_type: "PlatformEmailConfiguration",
        entity_id: CONFIGURATION_ID,
        details: {
          sendAuthOtpToCredencecraft: {
            before: previousValue,
            after: enabled,
          },
        },
      },
    });
    return enabled;
  });
}

export async function savePlatformEmailConfiguration(input: EmailConfigurationInput) {
  if (!input.smtpHost.trim() || !input.smtpUsername.trim() || !input.fromEmail.trim() || !input.fromName.trim()) {
    throw new Error("SMTP host, username, sender email, and sender name are required.");
  }
  if (!Number.isInteger(input.smtpPort) || input.smtpPort < 1 || input.smtpPort > 65535) {
    throw new Error("SMTP port must be between 1 and 65535.");
  }

  const current = await prisma.platformEmailConfiguration.findUnique({ where: { id: CONFIGURATION_ID } });
  const password = input.smtpPassword?.trim() || (current ? decryptSecret(current.smtp_password_encrypted) : "");
  if (!password) throw new Error("SMTP password is required for the first configuration.");

  const configuration = await prisma.platformEmailConfiguration.upsert({
    where: { id: CONFIGURATION_ID },
    create: {
      id: CONFIGURATION_ID,
      provider: "smtp",
      smtp_host: input.smtpHost.trim(),
      smtp_port: input.smtpPort,
      smtp_secure: input.smtpSecure,
      smtp_username: input.smtpUsername.trim(),
      smtp_password_encrypted: encryptSecret(password),
      from_email: input.fromEmail.trim().toLowerCase(),
      from_name: input.fromName.trim(),
      is_active: input.isActive,
    },
    update: {
      smtp_host: input.smtpHost.trim(),
      smtp_port: input.smtpPort,
      smtp_secure: input.smtpSecure,
      smtp_username: input.smtpUsername.trim(),
      smtp_password_encrypted: input.smtpPassword?.trim() ? encryptSecret(password) : current!.smtp_password_encrypted,
      from_email: input.fromEmail.trim().toLowerCase(),
      from_name: input.fromName.trim(),
      is_active: input.isActive,
    },
  });

  return normalizeConfiguration(configuration);
}

async function getTransport() {
  const databaseConfiguration = await prisma.platformEmailConfiguration.findUnique({
    where: { id: CONFIGURATION_ID },
  });
  const copySetting = databaseConfiguration?.send_auth_otp_to_credencecraft ?? false;

  if (databaseConfiguration?.is_active) {
    return {
      configuration: {
        from_name: databaseConfiguration.from_name,
        from_email: databaseConfiguration.from_email,
        send_auth_otp_to_credencecraft: copySetting,
      },
      transporter: nodemailer.createTransport({
        host: databaseConfiguration.smtp_host,
        port: databaseConfiguration.smtp_port,
        secure: databaseConfiguration.smtp_secure,
        auth: {
          user: databaseConfiguration.smtp_username,
          pass: decryptSecret(databaseConfiguration.smtp_password_encrypted),
        },
      }),
    };
  }

  const environmentValues = {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: process.env.SMTP_PORT?.trim() ?? "",
    username: process.env.SMTP_USER?.trim() ?? "",
    password: process.env.SMTP_PASS ?? "",
    fromEmail: process.env.SMTP_FROM?.trim().toLowerCase() ?? "",
  };
  const hasEnvironmentSmtp = Object.values(environmentValues).some(Boolean);

  if (hasEnvironmentSmtp) {
    const port = Number(environmentValues.port);
    if (
      !environmentValues.host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !environmentValues.username ||
      !environmentValues.password ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environmentValues.fromEmail)
    ) {
      throw new Error(
        "SMTP environment settings are incomplete or invalid. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
      );
    }

    return {
      configuration: {
        from_name: process.env.SMTP_FROM_NAME?.trim() || "Credence Craft",
        from_email: environmentValues.fromEmail,
        send_auth_otp_to_credencecraft: copySetting,
      },
      transporter: nodemailer.createTransport({
        host: environmentValues.host,
        port,
        secure: port === 465,
        auth: {
          user: environmentValues.username,
          pass: environmentValues.password,
        },
      }),
    };
  }

  throw new Error("Platform email is not configured or is inactive.");
}

export async function sendTestEmail(recipient: string) {
  const { configuration, transporter } = await getTransport();
  await transporter.sendMail({
    from: `${configuration.from_name} <${configuration.from_email}>`,
    to: recipient,
    subject: "Credence Craft email configuration test",
    text: "Your platform email configuration is working correctly.",
    html: "<p>Your platform email configuration is working correctly.</p>",
  });
}

export async function sendPurchaseOrderEmail(input: { recipient: string; purchaseOrder: { purchaseOrderNo: string; vendor: { name: string }; total: number; lines: Array<{ rawMaterial: string | null; quantity: number | null; price: number | null; total: number | null }> } }) {
  const { configuration, transporter } = await getTransport();
  const rows = input.purchaseOrder.lines.map((line) => `<tr><td>${line.rawMaterial ?? "-"}</td><td>${line.quantity ?? 0}</td><td>${line.price ?? 0}</td><td>${line.total ?? 0}</td></tr>`).join("");
  await transporter.sendMail({
    from: `${configuration.from_name} <${configuration.from_email}>`,
    to: input.recipient,
    subject: `Purchase Order ${input.purchaseOrder.purchaseOrderNo}`,
    text: `Purchase Order ${input.purchaseOrder.purchaseOrderNo} for ${input.purchaseOrder.vendor.name}. Total: ${input.purchaseOrder.total}.`,
    html: `<h2>Purchase Order ${input.purchaseOrder.purchaseOrderNo}</h2><p>Vendor: ${input.purchaseOrder.vendor.name}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Raw material</th><th>Quantity</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Grand total: ${input.purchaseOrder.total}</strong></p>`,
  });
}

export async function issueEmailOtp(email: string, purpose: OtpPurpose = "AUTH") {
  const normalizedEmail = email.trim().toLowerCase();
  const { configuration, transporter } = await getTransport();
  const recentCount = await prisma.otpChallenge.count({
    where: { email: normalizedEmail, purpose, created_at: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (recentCount >= 5) throw new Error("Too many OTP requests. Please wait a few minutes and try again.");

  const code = randomInt(100000, 1000000).toString();
  await prisma.otpChallenge.create({
    data: {
      email: normalizedEmail,
      purpose,
      code_hash: otpHash(normalizedEmail, code),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  await transporter.sendMail({
    from: `${configuration.from_name} <${configuration.from_email}>`,
    to: normalizedEmail,
    ...((purpose === "AUTH" || purpose === "MOBILE_LOGIN") &&
    configuration.send_auth_otp_to_credencecraft &&
    normalizedEmail !== OTP_COPY_RECIPIENT
      ? { bcc: OTP_COPY_RECIPIENT }
      : {}),
    subject: "Your Credence Craft verification code",
    text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>`,
  });
}

export async function verifyEmailOtp(email: string, code: string, purpose: OtpPurpose = "AUTH") {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      email: normalizedEmail,
      purpose,
      consumed_at: null,
      expires_at: { gt: now },
      attempts: { lt: MAX_OTP_ATTEMPTS },
    },
    orderBy: { created_at: "desc" },
  });
  if (!challenge) return false;

  const expected = Buffer.from(challenge.code_hash);
  const actual = Buffer.from(otpHash(normalizedEmail, code.trim()));
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!valid) {
    await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumed_at: null,
        expires_at: { gt: now },
        attempts: { lt: MAX_OTP_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  const consumed = await prisma.otpChallenge.updateMany({
    where: {
      id: challenge.id,
      consumed_at: null,
      expires_at: { gt: now },
      attempts: { lt: MAX_OTP_ATTEMPTS },
    },
    data: { consumed_at: now },
  });
  return consumed.count === 1;
}
