import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { hashPlatformPassword } from "@/lib/auth/platform-password-hasher";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export type PlatformAccountKind = "ADMIN" | "CMO" | "CTO";

export type CreatePlatformAccountInput = {
  fullName: string;
  email: string;
  mobileNumber: string;
  kind: PlatformAccountKind;
};

function normalizePlatformAccountInput(input: CreatePlatformAccountInput) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const mobileNumber = input.mobileNumber.trim();

  if (fullName.length < 2 || fullName.length > 255) {
    throw new Error("Enter a name between 2 and 255 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error("Enter a valid email address.");
  }
  if (!/^\+?[1-9]\d{7,14}$/.test(mobileNumber)) {
    throw new Error("Enter a valid mobile number with country code, such as +919876543210.");
  }
  if (input.kind !== "ADMIN" && input.kind !== "CMO" && input.kind !== "CTO") {
    throw new Error("Select a valid platform account type.");
  }

  return { fullName, email, mobileNumber };
}

export async function listPlatformAccessAccounts() {
  const actor = await requirePlatformSessionAdmin();
  if (actor.role === "ADMIN" && actor.team_role) {
    throw new Error("CMO and CTO team accounts cannot manage platform accounts.");
  }

  return prisma.platformAdmin.findMany({
    where: actor.role === "SUPER_ADMIN"
      ? { role: "ADMIN" }
      : { manager_id: actor.id, team_role: { not: null } },
    select: {
      id: true,
      full_name: true,
      email: true,
      mobile_number: true,
      role: true,
      team_role: true,
      manager_id: true,
      is_active: true,
      created_at: true,
      last_login_at: true,
    },
    orderBy: [{ role: "asc" }, { team_role: "asc" }, { created_at: "asc" }],
  });
}

export async function createPlatformAccessAccount(input: CreatePlatformAccountInput) {
  const actor = await requirePlatformSessionAdmin();
  if (actor.team_role) {
    throw new Error("CMO and CTO team accounts cannot manage platform accounts.");
  }
  const { fullName, email, mobileNumber } = normalizePlatformAccountInput(input);
  const teamRole = input.kind === "ADMIN" ? null : input.kind;
  const isCreatingAdmin = teamRole === null;

  if (isCreatingAdmin && actor.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super Admin can add a Platform Admin.");
  }
  if (!isCreatingAdmin && actor.role !== "ADMIN") {
    throw new Error("An Admin account is required to assign CMO or CTO team seats.");
  }

  return prisma.$transaction(async (transaction) => {
    const manager = await transaction.platformAdmin.findUnique({
      where: { id: actor.id },
      select: { is_active: true },
    });
    if (!manager?.is_active) {
      throw new Error("An active platform account is required to manage access.");
    }

    const existingAccount = await transaction.platformAdmin.findUnique({ where: { email } });
    const canReactivateTeamSeat = Boolean(
      teamRole &&
      existingAccount &&
      existingAccount.manager_id === actor.id &&
      existingAccount.team_role === teamRole &&
      !existingAccount.is_active,
    );
    if (existingAccount && !canReactivateTeamSeat) {
      throw new Error("A platform account already uses this email address.");
    }

    const existingTeamSeat = teamRole
      ? await transaction.platformAdmin.findUnique({
          where: { manager_id_team_role: { manager_id: actor.id, team_role: teamRole } },
        })
      : null;

    if (existingTeamSeat?.is_active) {
      throw new Error(`Your ${teamRole} team seat is already active.`);
    }
    if (existingTeamSeat && existingTeamSeat.id !== existingAccount?.id) {
      throw new Error(`Your ${teamRole} team seat already exists. Reactivate it from the account list.`);
    }

    const account = existingTeamSeat
      ? await transaction.platformAdmin.update({
          where: { id: existingTeamSeat.id },
          data: {
            full_name: fullName,
            email,
            mobile_number: mobileNumber,
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
            team_role: teamRole,
            manager_id: teamRole ? actor.id : null,
          },
        });

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: actor.id,
        action: existingTeamSeat ? "PLATFORM_ACCOUNT_REACTIVATED" : "PLATFORM_ACCOUNT_CREATED",
        entity_type: "PlatformAdmin",
        entity_id: account.id,
        details: { role: account.role, teamRole: account.team_role },
      },
    });

    return account;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setPlatformAccessAccountActive(accountId: string, isActive: boolean) {
  const actor = await requirePlatformSessionAdmin();
  if (actor.team_role) {
    throw new Error("CMO and CTO team accounts cannot manage platform accounts.");
  }
  const account = await prisma.platformAdmin.findUnique({
    where: { id: accountId },
    select: { id: true, role: true, team_role: true, manager_id: true, is_active: true },
  });
  if (!account || account.role !== "ADMIN") {
    throw new Error("Platform account not found.");
  }
  if (actor.role === "SUPER_ADMIN") {
    if (account.id === actor.id) {
      throw new Error("You cannot deactivate your own account.");
    }
  } else if (account.manager_id !== actor.id || !account.team_role) {
    throw new Error("You can only manage your own CMO and CTO team seats.");
  }
  const updated = await prisma.$transaction(async (transaction) => {
    if (isActive && account.team_role && account.manager_id) {
      const manager = await transaction.platformAdmin.findUnique({
        where: { id: account.manager_id },
        select: { is_active: true },
      });
      if (!manager?.is_active) {
        throw new Error("Activate the managing Admin account before reactivating this team seat.");
      }
    }

    const result = await transaction.platformAdmin.update({
      where: { id: account.id },
      data: { is_active: isActive },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: actor.id,
        action: isActive ? "PLATFORM_ACCOUNT_ACTIVATED" : "PLATFORM_ACCOUNT_DEACTIVATED",
        entity_type: "PlatformAdmin",
        entity_id: account.id,
        details: { role: account.role, teamRole: account.team_role },
      },
    });
    if (!isActive && account.team_role === null) {
      const activeTeamMembers = await transaction.platformAdmin.findMany({
        where: { manager_id: account.id, is_active: true, team_role: { not: null } },
        select: { id: true, team_role: true },
      });
      if (activeTeamMembers.length > 0) {
        await transaction.platformAdmin.updateMany({
          where: { id: { in: activeTeamMembers.map(({ id }) => id) } },
          data: { is_active: false },
        });
        await transaction.platformAuditEvent.createMany({
          data: activeTeamMembers.map((teamMember) => ({
            platform_admin_id: actor.id,
            action: "PLATFORM_ACCOUNT_DEACTIVATED",
            entity_type: "PlatformAdmin",
            entity_id: teamMember.id,
            details: {
              teamRole: teamMember.team_role,
              reason: "The managing Admin account was deactivated.",
            },
          })),
        });
      }
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return updated;
}
