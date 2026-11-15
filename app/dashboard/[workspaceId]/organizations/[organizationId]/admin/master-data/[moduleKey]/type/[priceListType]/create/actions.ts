"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createMasterValueForOrganization } from "@/lib/master-data/master-data-constants";
import { resolvePriceListType } from "@/lib/master-data/price-list-type-resolver";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function createPriceListTypeRecordAction(
  previousState: { error: string | null; successToken?: number; groupId?: string },
  formData: FormData,
): Promise<{ error: string | null; successToken?: number; groupId?: string }> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const priceListType = String(formData.get("priceListType") ?? "");
  const groupName = String(formData.get("groupName") ?? "").trim();
  const inlineCreate = formData.get("inlineCreate") === "true";
  const basePath = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/price-list`;
  const typePath = `${basePath}/type/${encodeURIComponent(priceListType)}`;
  void previousState;

  if (!workspaceId || !organizationId || !groupName) {
    return { error: "Enter a Group Name." };
  }
  const configuredType = resolvePriceListType(priceListType);
  if (!configuredType) return { error: "Select a valid Price List Type." };

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) return { error: "Organization not found." };
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  let created: { value_id: string };
  try {
    created = await createMasterValueForOrganization(organization.id, "price-list", {
      label: groupName,
      fields: {
        Channel_Name: groupName,
        Channel_Type: configuredType,
      },
      actorUserId: user.id,
    });
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    console.error("Price List Contact record creation failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Unable to create the Price List group. Review the details and try again." };
  }

  revalidatePath(basePath);
  revalidatePath(typePath);
  if (inlineCreate) return { error: null, successToken: Date.now(), groupId: created.value_id };
  redirect(`${typePath}?saved=create`);
}
