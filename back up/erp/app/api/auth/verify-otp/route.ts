import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, resolveUniqueProfileName, withUniqueProfileName } from "../../../lib/auth";
import { prisma } from "../../../lib/bootstrap/prisma";

const DEV_OTP = "1234";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const otpCode = typeof body.otpCode === "string" ? body.otpCode.trim() : "";
    const profileName = typeof body.profileName === "string" ? body.profileName.trim() : "";
    const fullName = typeof body.name === "string" ? body.name.trim() : "Workspace User";

    if (!email || !otpCode) {
      return NextResponse.json({ error: "Email and OTP are required." }, { status: 400 });
    }

    const isDemoOtp = process.env.NODE_ENV !== "production" && otpCode === DEV_OTP;

    let latestOtp: { id: string; otpCode: string } | null = null;
    if (prisma?.otpRequest) {
      latestOtp = await prisma.otpRequest.findFirst({
        where: {
          email,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!latestOtp && !isDemoOtp) {
      return NextResponse.json({ error: "OTP expired or invalid." }, { status: 400 });
    }

    if (latestOtp && latestOtp.otpCode !== otpCode && !isDemoOtp) {
      return NextResponse.json({ error: "Invalid OTP code." }, { status: 400 });
    }

    if (latestOtp && prisma?.otpRequest) {
      await prisma.otpRequest.delete({
        where: { id: latestOtp.id },
      });
    }

    let user: { id: string; name: string; email: string; profileName?: string | null } = {
      id: `demo-user-${email}`,
      name: fullName || "Workspace User",
      email,
      profileName: profileName || null,
    };

    if (prisma?.user) {
      const dbUser = await prisma.user.findUnique({ where: { email } });

      if (dbUser) {
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

        if (!dbUser.isActive) {
          return NextResponse.json({ error: "Your account is inactive. Please contact admin." }, { status: 403 });
        }

        user = dbUser;
        if (profileName && profileName !== dbUser.profileName) {
          user = await withUniqueProfileName(profileName, dbUser.id, async (safeProfileName) => {
            if (safeProfileName === null && dbUser.profileName) {
              return prisma.user.update({
                where: { id: dbUser.id },
                data: { profileName: dbUser.profileName },
              });
            }

            return prisma.user.update({
              where: { id: dbUser.id },
              data: { profileName: safeProfileName ?? dbUser.profileName },
            });
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

        const createdUser = await withUniqueProfileName(profileName, undefined, async (safeProfileName) =>
          prisma.user.create({
            data: {
              name: fullName || "Workspace User",
              email,
              ...(safeProfileName ? { profileName: safeProfileName } : {}),
              isPlatformAdmin: true,
            },
          })
        );

        const createdProfileName = createdUser.profileName || profileName;
        const workspaceSlug = slugify(createdProfileName);
        await prisma.workspace.upsert({
          where: { slug: workspaceSlug },
          update: { name: createdProfileName },
          create: {
            name: createdProfileName,
            slug: workspaceSlug,
            ownerId: createdUser.id,
          },
        });

        user = createdUser;
      }
    }

    const resolvedProfileName = user.profileName || profileName || user.name || "workspace";
    const workspaceSlug = slugify(resolvedProfileName);

    if (prisma?.workspace && user.id && !user.id.startsWith("demo-user-")) {
      const existingWorkspace = await prisma.workspace.findFirst({
        where: { ownerId: user.id },
      });

      if (!existingWorkspace) {
        await prisma.workspace.create({
          data: {
            name: resolvedProfileName,
            slug: workspaceSlug,
            ownerId: user.id,
          },
        });
      }
    }

    const token = createSessionToken(user.id, user.email, resolvedProfileName);

    const response = NextResponse.json({
      message: "OTP verified successfully.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileName: resolvedProfileName,
      },
      profileName: resolvedProfileName,
      workspaceSlug,
      role: "super_admin",
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to verify OTP.",
      },
      { status: 500 }
    );
  }
}
