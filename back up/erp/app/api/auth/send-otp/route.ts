import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/bootstrap/prisma";
import { sendOtpEmail } from "../../../lib/email";

const DEV_OTP = "1234";

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "Workspace User";
    const profileName = typeof body.profileName === "string" ? body.profileName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const userModel = prisma?.user;
    const otpModel = prisma?.otpRequest;

    let user: { id: string; name: string; email: string; profileName?: string | null } = {
      id: `demo-user-${email}`,
      name: name || "Workspace User",
      email,
      profileName: profileName || null,
    };

    if (userModel) {
      const existingUser = await userModel.findUnique({ where: { email } });

      if (existingUser) {
        if (profileName) {
          return NextResponse.json(
            {
              error: "An account with this email already exists. Please log in instead.",
              code: "USER_ALREADY_EXISTS",
              alreadyRegistered: true,
            },
            { status: 409 }
          );
        }

        user = existingUser;
        if (name && name !== existingUser.name) {
          user = await userModel.update({
            where: { id: existingUser.id },
            data: { name },
          });
        }
        if (profileName && profileName !== existingUser.profileName) {
          user = await userModel.update({
            where: { id: existingUser.id },
            data: { profileName },
          });
        }
      } else {
        if (!profileName) {
          return NextResponse.json(
            {
              error: "User not found. Please register first.",
              code: "USER_NOT_FOUND",
              needsRegistration: true,
            },
            { status: 404 }
          );
        }

        const createdUser = await userModel.create({
          data: {
            name: name || "Workspace User",
            email,
            profileName: profileName || null,
          },
        });
        user = createdUser;
      }
    }

    const otpCode = process.env.NODE_ENV === "production" ? generateOtp() : DEV_OTP;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (otpModel) {
      await otpModel.create({
        data: {
          userId: user.id,
          email,
          otpCode,
          expiresAt,
        },
      });
    }

    const emailResult = await sendOtpEmail(email, otpCode);

    return NextResponse.json({
      message: emailResult.sent ? "OTP sent successfully." : "OTP generated; email provider not configured.",
      userId: user.id,
      email: user.email,
      sent: emailResult.sent,
      devOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
      reason: emailResult.sent ? undefined : emailResult.reason,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to send OTP.",
      },
      { status: 500 }
    );
  }
}
