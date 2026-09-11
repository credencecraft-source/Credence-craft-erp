import { createHash, randomBytes, randomUUID } from "node:crypto";
import { OrganizationInvitationStatus, OrganizationRole as PrismaOrganizationRole } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess, type OrganizationRole } from "./organization-service";

const INVITATION_DAYS = 7;

export async function createStandaloneUser(input: {
  fullName: string;
  profileName: string;
  email: string;
}) {
  const fullName = input.fullName.trim();
  const profileName = input.profileName.trim();
  const email = input.email.trim().toLowerCase();
  if (fullName.length < 2 || profileName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Full name, profile name, and a valid email are required.");
  }

  const existingUser = await prisma.workspaceUser.findUnique({
    where: { email },
    select: { id: true, workspace_id: true, full_name: true, profile_name: true, email: true },
  });

  if (existingUser) {
    return existingUser;
  }

  return prisma.workspaceUser.create({
    data: { workspace_id: randomUUID(), full_name: fullName, profile_name: profileName, email, email_verified: false },
    select: { id: true, workspace_id: true, full_name: true, profile_name: true, email: true },
  });
}

export async function createOrganizationInvitation(input: {
  organizationId: string;
  inviteeUserId: string;
  role: OrganizationRole;
  invitedByUserId: string;
}) {
  const actorMembership = await requireOrganizationAccess(input.invitedByUserId, input.organizationId, ["OWNER", "ADMIN"]);
  const organizationId = actorMembership.organization_id;
  const existing = await prisma.organizationInvitation.findFirst({
    where: { organization_id: organizationId, invitee_user_id: input.inviteeUserId, status: OrganizationInvitationStatus.PENDING, expires_at: { gt: new Date() } },
  });
  if (existing) throw new Error("An active invitation already exists for this user.");
  const membership = await prisma.organizationMembership.findUnique({ where: { organization_id_workspace_user_id: { organization_id: organizationId, workspace_user_id: input.inviteeUserId } } });
  if (membership?.is_active) throw new Error("This user is already a member of the organization.");
  const invitee = await prisma.workspaceUser.findUnique({
    where: { id: input.inviteeUserId },
    select: { email: true },
  });
  if (!invitee) throw new Error("The invited workspace user was not found.");

  const invitation = await prisma.$transaction(async (transaction) => {
    const token = randomBytes(32).toString("hex");
    const created = await transaction.organizationInvitation.create({
      data: {
        id: randomUUID(), token, token_hash: createHash("sha256").update(token).digest("hex"), recipient_email: invitee.email, organization_id: organizationId,
        invitee_user_id: input.inviteeUserId, invited_by_user_id: input.invitedByUserId,
        role: input.role as PrismaOrganizationRole, expires_at: new Date(Date.now() + INVITATION_DAYS * 86400000),
      }, include: { organization: { select: { organization_name: true, organization_id: true } } },
    });
    await transaction.workspaceNotification.create({
      data: { workspace_user_id: input.inviteeUserId, type: "ORGANIZATION_INVITATION", reference_id: created.id, title: `Invitation to ${created.organization.organization_name}`, body: `You have been invited as ${input.role}.` },
    });
    return created;
  });
  return invitation;
}

export async function listPendingInvitations(userId: string) {
  await prisma.organizationInvitation.updateMany({ where: { invitee_user_id: userId, status: OrganizationInvitationStatus.PENDING, expires_at: { lte: new Date() } }, data: { status: OrganizationInvitationStatus.EXPIRED } });
  return prisma.organizationInvitation.findMany({ where: { invitee_user_id: userId, status: OrganizationInvitationStatus.PENDING }, include: { organization: { select: { organization_name: true, organization_id: true } }, invitedBy: { select: { full_name: true } } }, orderBy: { created_at: "desc" } });
}

export async function acceptOrganizationInvitation(userId: string, token: string) {
  return prisma.$transaction(async (transaction) => {
    const invitation = await transaction.organizationInvitation.findUnique({ where: { token } });
    if (!invitation || invitation.invitee_user_id !== userId || invitation.status !== OrganizationInvitationStatus.PENDING || invitation.expires_at <= new Date()) throw new Error("This invitation is invalid or expired.");
    const membership = await transaction.organizationMembership.upsert({
      where: { organization_id_workspace_user_id: { organization_id: invitation.organization_id, workspace_user_id: userId } },
      create: { id: randomUUID(), organization_id: invitation.organization_id, workspace_user_id: userId, role: invitation.role },
      update: { role: invitation.role, is_active: true },
    });
    await transaction.organizationInvitation.update({ where: { id: invitation.id }, data: { status: OrganizationInvitationStatus.ACCEPTED, accepted_at: new Date() } });
    await transaction.workspaceNotification.updateMany({ where: { workspace_user_id: userId, reference_id: invitation.id }, data: { read_at: new Date() } });
    return membership;
  });
}

export async function listOrganizationInvitations(organizationId: string, actorUserId: string) {
  const membership = await requireOrganizationAccess(actorUserId, organizationId);
  return prisma.organizationInvitation.findMany({ where: { organization_id: membership.organization_id }, include: { invitee: { select: { full_name: true, profile_name: true, email: true } } }, orderBy: { created_at: "desc" } });
}
