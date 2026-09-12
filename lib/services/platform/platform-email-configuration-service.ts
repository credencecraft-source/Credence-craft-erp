import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/database/prisma-client";

const CONFIGURATION_ID = "default";
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
export type OtpPurpose = "AUTH" | "SUPPORT";

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

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured before saving email settings.");
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored email password is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}

function otpHash(email: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured before using email OTP.");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function normalizeConfiguration(configuration: any) {
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
    hasPassword: Boolean(configuration.smtp_password_encrypted),
  };
}

export async function getPlatformEmailConfiguration() {
  return normalizeConfiguration(await prisma.platformEmailConfiguration.findUnique({ where: { id: CONFIGURATION_ID } }));
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
  const configuration = await prisma.platformEmailConfiguration.findUnique({ where: { id: CONFIGURATION_ID } });
  if (!configuration || !configuration.is_active) throw new Error("Platform email is not configured or is inactive.");

  return {
    configuration,
    transporter: nodemailer.createTransport({
      host: configuration.smtp_host,
      port: configuration.smtp_port,
      secure: configuration.smtp_secure,
      auth: {
        user: configuration.smtp_username,
        pass: decryptSecret(configuration.smtp_password_encrypted),
      },
    }),
  };
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
    subject: "Your Credence Craft verification code",
    text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>`,
  });
}

export async function verifyEmailOtp(email: string, code: string, purpose: OtpPurpose = "AUTH") {
  const normalizedEmail = email.trim().toLowerCase();
  const challenge = await prisma.otpChallenge.findFirst({
    where: { email: normalizedEmail, purpose, consumed_at: null, expires_at: { gt: new Date() } },
    orderBy: { created_at: "desc" },
  });
  if (!challenge || challenge.attempts >= MAX_OTP_ATTEMPTS) return false;

  const expected = Buffer.from(challenge.code_hash);
  const actual = Buffer.from(otpHash(normalizedEmail, code.trim()));
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!valid) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return false;
  }

  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumed_at: new Date() } });
  return true;
}
