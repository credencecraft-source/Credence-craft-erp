import { prisma } from "@/lib/database/prisma-client";
import {
  issueEmailOtp,
  verifyEmailOtp,
} from "@/lib/services/platform/platform-email-configuration-service";

const MOBILE_LOGIN_OTP_PURPOSE = "MOBILE_LOGIN";

function maskEmail(email: string) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 1) return "your verified email address";

  return `${email[0]}***${email.slice(atIndex)}`;
}

export async function sendMobileAccountEmailOtp(mobileNumber: string) {
  const user = await prisma.workspaceUser.findUnique({
    where: { mobile_number: mobileNumber },
    select: { email: true, email_verified: true },
  });

  if (!user?.email || !user.email_verified) return null;

  await issueEmailOtp(user.email, MOBILE_LOGIN_OTP_PURPOSE);
  return maskEmail(user.email);
}

export async function verifyMobileAccountEmailOtp(
  mobileNumber: string,
  code: string,
) {
  const user = await prisma.workspaceUser.findUnique({
    where: { mobile_number: mobileNumber },
    select: {
      id: true,
      workspace_id: true,
      email: true,
      email_verified: true,
    },
  });

  if (!user?.email || !user.email_verified) return null;

  const valid = await verifyEmailOtp(
    user.email,
    code,
    MOBILE_LOGIN_OTP_PURPOSE,
  );
  if (!valid) return null;

  const updated = await prisma.workspaceUser.updateMany({
    where: {
      id: user.id,
      mobile_number: mobileNumber,
      email: user.email,
      email_verified: true,
    },
    data: { last_login_at: new Date() },
  });

  return updated.count === 1
    ? { id: user.id, workspace_id: user.workspace_id }
    : null;
}
