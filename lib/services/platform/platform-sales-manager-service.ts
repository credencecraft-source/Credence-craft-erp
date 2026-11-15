import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { hashPlatformPassword } from "@/lib/auth/platform-password-hasher";
import { requirePlatformNavigationPermission } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type CreatePlatformSalesManagerInput = {
  fullName: string;
  email: string;
  mobileNumber?: string;
};

function normalizeSalesManagerInput(input: CreatePlatformSalesManagerInput) {
  const fullName = normalizeUppercase(input.fullName.trim());
  const email = input.email.trim().toLowerCase();
  const mobileNumber = input.mobileNumber?.trim() ?? "";

  if (fullName.length < 2 || fullName.length > 255) {
    throw new Error("Enter a name between 2 and 255 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error("Enter a valid email address.");
  }
  if (mobileNumber && !/^\+?[1-9]\d{7,14}$/.test(mobileNumber)) {
    throw new Error("Enter a valid mobile number with country code, such as +919876543210.");
  }

  return { fullName, email, mobileNumber: mobileNumber || null };
}

export async function listPlatformSalesManagers() {
  const actor = await requirePlatformNavigationPermission("canManageSalesTeam");

  return prisma.platformAdmin.findMany({
    where: {
      role: "ADMIN",
      team_role: "SALES_MANAGER",
      ...(actor.actualRole === "SUPER_ADMIN" ? {} : { manager_id: actor.id }),
    },
    select: {
      id: true,
      full_name: true,
      email: true,
      mobile_number: true,
      is_active: true,
      created_at: true,
      last_login_at: true,
      _count: { select: { assignedPlatformLeads: true } },
    },
    orderBy: [{ is_active: "desc" }, { full_name: "asc" }],
  });
}

export async function createPlatformSalesManager(input: CreatePlatformSalesManagerInput) {
  const actor = await requirePlatformNavigationPermission("canManageSalesTeam");
  const { fullName, email, mobileNumber } = normalizeSalesManagerInput(input);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformAdmin.findUnique({
      where: { email },
      select: { id: true, is_active: true, team_role: true, manager_id: true },
    });
    const canReactivate = Boolean(
      existing
      && !existing.is_active
      && existing.team_role === "SALES_MANAGER"
      && (actor.actualRole === "SUPER_ADMIN" || existing.manager_id === actor.id),
    );
    if (existing && !canReactivate) {
      throw new Error("A platform account already uses this email address.");
    }

    const account = canReactivate && existing
      ? await transaction.platformAdmin.update({
          where: { id: existing.id },
          data: {
            full_name: fullName,
            ...(mobileNumber ? { mobile_number: mobileNumber } : {}),
            is_active: true,
          },
        })
      : await transaction.platformAdmin.create({
          data: {
            full_name: fullName,
            email,
            mobile_number: mobileNumber,
            password_hash: hashPlatformPassword(randomBytes(32).toString("base64url")),
            role: "ADMIN",
            team_role: "SALES_MANAGER",
            manager_id: actor.actualRole === "SUPER_ADMIN" ? null : actor.id,
          },
        });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: actor.id,
        action: canReactivate ? "PLATFORM_SALES_MANAGER_REACTIVATED" : "PLATFORM_SALES_MANAGER_CREATED",
        entity_type: "PlatformAdmin",
        entity_id: account.id,
        details: { teamRole: account.team_role, managerId: account.manager_id },
      },
    });

    return {
      id: account.id,
      full_name: account.full_name,
      email: account.email,
      mobile_number: account.mobile_number,
      is_active: account.is_active,
      created_at: account.created_at,
      last_login_at: account.last_login_at,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
