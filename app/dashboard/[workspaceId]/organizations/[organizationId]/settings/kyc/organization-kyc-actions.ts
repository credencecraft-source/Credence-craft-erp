"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import {
  resetOrganizationKycDraft,
  upsertOrganizationKycDraft,
} from "@/lib/services/organizations/organization-kyc-service";
import {
  OrganizationKycValidationError,
  parseOrganizationKycFormData,
} from "@/lib/services/organizations/organization-kyc-types";
import type { OrganizationKycFormData } from "@/lib/services/organizations/organization-kyc-types";

async function saveOrganizationKyc(
  workspaceId: string,
  publicOrganizationId: string,
  formData: FormData,
  submitting: boolean,
): Promise<{ error: string | null }> {
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, publicOrganizationId);
  if (!organization) notFound();

  let formValues: OrganizationKycFormData;
  try {
    formValues = parseOrganizationKycFormData(formData, submitting);
  } catch (error) {
    if (error instanceof OrganizationKycValidationError) {
      return { error: error.message };
    }
    throw error;
  }
  await upsertOrganizationKycDraft(user.id, organization.id, {
    ...formValues,
    registrationSnapshot: {
      gst_number: organization.gst_number,
      name: organization.organization_name,
      address: [
        organization.address_line_1,
        organization.address_line_2,
        organization.city,
        organization.state,
        organization.pin_code,
        organization.country,
      ].filter(Boolean).join(", "),
      createdAt: organization.created_at.toISOString().slice(0, 10),
    },
    submitting,
  });

  revalidatePath(`/dashboard/${workspaceId}/organizations/${publicOrganizationId}/settings/kyc`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${publicOrganizationId}/settings/dummy-data`);
  return { error: null };
}

export async function saveOrganizationKycDraftAction(
  workspaceId: string,
  publicOrganizationId: string,
  formData: FormData,
) {
  return saveOrganizationKyc(workspaceId, publicOrganizationId, formData, false);
}

export async function submitOrganizationKycAction(
  workspaceId: string,
  publicOrganizationId: string,
  formData: FormData,
) {
  return saveOrganizationKyc(workspaceId, publicOrganizationId, formData, true);
}

export async function resetOrganizationKycDraftAction(
  workspaceId: string,
  publicOrganizationId: string,
) {
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, publicOrganizationId);
  if (!organization) notFound();

  await resetOrganizationKycDraft(user.id, organization.id);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${publicOrganizationId}/settings/kyc`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${publicOrganizationId}/settings/dummy-data`);
  return { error: null };
}
