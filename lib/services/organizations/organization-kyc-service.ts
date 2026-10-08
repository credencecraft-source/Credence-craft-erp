import { Prisma, type OrganizationKycProfile } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { requireOrganizationPermission } from "./organization-service";
import type { OrganizationKycFormData } from "./organization-kyc-types";

export class OrganizationKycReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationKycReviewError";
  }
}

export async function getOrganizationKycProfileForUser(
  workspaceUserId: string,
  organizationId: string,
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    organizationId,
    "ORGANIZATION_SETTINGS",
  );
  return prisma.organizationKycProfile.findUnique({
    where: { organization_id: membership.organization_id },
  });
}

export async function getOrganizationKycProfileForPlatform(organizationId: string) {
  await requirePlatformSessionAdmin();
  return prisma.organizationKycProfile.findUnique({
    where: { organization_id: organizationId },
  });
}

export async function upsertOrganizationKycDraft(
  workspaceUserId: string,
  organizationId: string,
  data: OrganizationKycFormData & {
    registrationSnapshot: Prisma.InputJsonValue;
    submitting: boolean;
  },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    organizationId,
    "ORGANIZATION_SETTINGS",
  );
  const now = new Date();
  const profileData = {
    status: data.submitting ? "SUBMITTED" : "DRAFT",
    registration_snapshot: data.registrationSnapshot,
    kyc_details: data.kycDetails,
    business_types: data.businessTypes,
    business_type_other: data.businessTypeOther,
    staff_count: data.staffCount,
    factory_count: data.factoryCount,
    outlet_count: data.outletCount,
    business_started_year: data.businessStartedYear,
    software_used: data.softwareUsed,
    major_challenges: data.majorChallenges,
    major_challenge_other: data.majorChallengeOther,
    brands_worked_with: data.brandsWorkedWith,
    monthly_production_pcs: data.monthlyProductionPcs,
    business_activities: data.businessActivities,
    factory_arrangement: data.factoryArrangement,
    submitted_at: data.submitting ? now : null,
    reviewed_at: null,
    reviewed_by_platform_admin_id: null,
    review_note: null,
    updated_at: now,
  };

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.organizationKycProfile.findUnique({
      where: { organization_id: membership.organization_id },
      select: { status: true },
    });
    if (existing?.status === "SUBMITTED" || existing?.status === "APPROVED") {
      throw new Error("This KYC profile is locked while submitted or approved.");
    }

    let profile: OrganizationKycProfile;
    if (existing) {
      const updated = await transaction.organizationKycProfile.updateMany({
        where: {
          organization_id: membership.organization_id,
          status: { in: ["DRAFT", "REJECTED"] },
        },
        data: profileData,
      });
      if (updated.count !== 1) {
        throw new Error("This KYC profile changed and can no longer be edited.");
      }
      profile = await transaction.organizationKycProfile.findUniqueOrThrow({
        where: { organization_id: membership.organization_id },
      });
    } else {
      profile = await transaction.organizationKycProfile.create({
        data: {
          organization_id: membership.organization_id,
          ...profileData,
        },
      });
    }

    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: membership.workspace_user_id,
        module: "kyc",
        action: data.submitting ? "KYC_SUBMITTED" : "KYC_DRAFT_SAVED",
        entity_type: "OrganizationKycProfile",
        entity_id: profile.id,
        details: { status: profile.status },
      },
    });

    return profile;
  });
}

export async function resetOrganizationKycDraft(
  workspaceUserId: string,
  organizationId: string,
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    organizationId,
    "ORGANIZATION_SETTINGS",
  );

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.organizationKycProfile.findUnique({
      where: { organization_id: membership.organization_id },
      select: { id: true, status: true },
    });
    if (!existing) return;
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED" && existing.status !== "NOT_STARTED") {
      throw new Error("This KYC profile is locked while submitted or approved.");
    }

    const reset = await transaction.organizationKycProfile.updateMany({
      where: {
        organization_id: membership.organization_id,
        status: { in: ["DRAFT", "REJECTED", "NOT_STARTED"] },
      },
      data: {
        status: "DRAFT",
        kyc_details: Prisma.DbNull,
        business_types: [],
        business_type_other: null,
        staff_count: null,
        factory_count: null,
        outlet_count: null,
        business_started_year: null,
        software_used: null,
        major_challenges: [],
        major_challenge_other: null,
        brands_worked_with: null,
        monthly_production_pcs: null,
        business_activities: [],
        factory_arrangement: null,
        submitted_at: null,
        reviewed_at: null,
        reviewed_by_platform_admin_id: null,
        review_note: null,
        updated_at: new Date(),
      },
    });
    if (reset.count !== 1) {
      throw new Error("This KYC profile changed and can no longer be reset.");
    }

    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: membership.workspace_user_id,
        module: "kyc",
        action: "KYC_DRAFT_RESET",
        entity_type: "OrganizationKycProfile",
        entity_id: existing.id,
        details: { status: "DRAFT", resetAnswers: true },
      },
    });
  });
}

export async function reviewOrganizationKyc(
  platformAdminId: string,
  organizationId: string,
  approved: boolean,
  note?: string,
) {
  const platformAdmin = await requirePlatformSessionAdmin();
  if (platformAdmin.id !== platformAdminId) {
    throw new Error("The platform admin session changed before review.");
  }
  const cleanNote = note?.trim() || null;
  if (cleanNote && cleanNote.length > 2000) {
    throw new OrganizationKycReviewError("The review note must be 2,000 characters or fewer.");
  }
  if (!approved && !cleanNote) {
    throw new OrganizationKycReviewError("Add a review note when rejecting a KYC submission.");
  }

  return prisma.$transaction(async (transaction) => {
    const result = await transaction.organizationKycProfile.updateMany({
      where: { organization_id: organizationId, status: "SUBMITTED" },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        reviewed_at: new Date(),
        reviewed_by_platform_admin_id: platformAdminId,
        review_note: cleanNote,
      },
    });
    if (result.count !== 1) {
      throw new OrganizationKycReviewError("Only a submitted KYC profile can be reviewed.");
    }

    const reviewed = await transaction.organizationKycProfile.findUniqueOrThrow({
      where: { organization_id: organizationId },
    });
    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: platformAdminId,
        action: approved ? "KYC_APPROVED" : "KYC_REJECTED",
        entity_type: "OrganizationKycProfile",
        entity_id: reviewed.id,
        details: { organizationId, note: cleanNote },
      },
    });
    return reviewed;
  });
}
