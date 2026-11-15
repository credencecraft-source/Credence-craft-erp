"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createUniformParticipant,
  createUniformEmployeeMeasurement,
  assignUniformMeasurementsToGroup,
  createUniformMeasurementGroupAndAssign,
  deleteUniformMeasurementGroup,
  getUniformMeasurementChartDetails,
} from "@/lib/services/uniform-management/uniform-management-service";
import { UniformManagementError } from "@/lib/services/uniform-management/uniform-management-contract";

export type UniformActionState = { error: string };

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireWorkspaceMatch(workspaceId: string) {
  const user = await requireSessionUser();
  if (!user || user.workspace_id !== workspaceId) {
    redirect(user?.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  return user;
}

function getActionError(error: unknown) {
  if (error instanceof UniformManagementError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "This code or measurement already exists. Review the current records and try another value.";
  }
  throw error;
}

function readEmployeeMeasurementDetails(formData: FormData) {
  const countValue = getString(formData, "detailCount");
  if (!/^\d{1,3}$/.test(countValue)) throw new UniformManagementError("Add at least one measurement row.");
  const count = Number(countValue);
  if (count < 1 || count > 200) throw new UniformManagementError("Add between 1 and 200 measurement rows.");
  return Array.from({ length: count }, (_, index) => ({
    templateDetailId: getString(formData, `templateDetail:${index}`),
    inputValue: getString(formData, `input:${index}`),
  }));
}

export async function createUniformEmployeeMeasurementAction(
  workspaceId: string,
  organizationId: string,
  _previousState: UniformActionState,
  formData: FormData,
): Promise<UniformActionState> {
  const user = await requireWorkspaceMatch(workspaceId);
  try {
    await createUniformEmployeeMeasurement(user.id, organizationId, {
      participantId: getString(formData, "participantId"),
      categoryId: getString(formData, "categoryId"),
      subCategoryId: getString(formData, "subCategoryId"),
      styleId: getString(formData, "styleId"),
      measurementChartId: getString(formData, "measurementChartId"),
      details: readEmployeeMeasurementDetails(formData),
    });
  } catch (error) {
    return { error: getActionError(error) };
  }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements?saved=1`);
}

export async function getUniformMeasurementChartDetailsAction(
  workspaceId: string,
  organizationId: string,
  chartId: string,
): Promise<{ details: Awaited<ReturnType<typeof getUniformMeasurementChartDetails>>; error: string }> {
  const user = await requireWorkspaceMatch(workspaceId);
  try {
    const details = await getUniformMeasurementChartDetails(user.id, organizationId, chartId);
    return { details, error: "" };
  } catch (error) {
    return { details: [], error: getActionError(error) };
  }
}

export async function createOrAssignUniformMeasurementGroupAction(
  workspaceId: string,
  organizationId: string,
  selectedMeasurementIds: string[],
  mode: string,
  groupName: string,
  groupId: string,
): Promise<UniformActionState> {
  const user = await requireWorkspaceMatch(workspaceId);
  if (
    !Array.isArray(selectedMeasurementIds)
    || selectedMeasurementIds.length < 1
    || selectedMeasurementIds.length > 200
    || selectedMeasurementIds.some((id) => typeof id !== "string")
  ) {
    return { error: "Select between 1 and 200 employee measurements." };
  }
  if (typeof mode !== "string") return { error: "Choose a measurement group action." };
  try {
    if (mode === "create") {
      if (typeof groupName !== "string") return { error: "Enter a valid group name." };
      await createUniformMeasurementGroupAndAssign(
        user.id,
        organizationId,
        selectedMeasurementIds,
        groupName,
      );
    } else if (mode === "assign") {
      if (typeof groupId !== "string") return { error: "Choose a valid measurement group." };
      await assignUniformMeasurementsToGroup(user.id, organizationId, selectedMeasurementIds, groupId);
    } else {
      return { error: "Choose whether to create a group or assign to an existing group." };
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A measurement group with this name already exists in this organization." };
    }
    return { error: getActionError(error) };
  }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/grouped-measurements`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements`);
  return { error: "" };
}

export async function deleteUniformMeasurementGroupAction(
  workspaceId: string,
  organizationId: string,
  groupId: string,
): Promise<UniformActionState> {
  const user = await requireWorkspaceMatch(workspaceId);
  if (typeof groupId !== "string" || !groupId.trim()) return { error: "Choose a measurement group." };
  try {
    await deleteUniformMeasurementGroup(user.id, organizationId, groupId);
  } catch (error) {
    return { error: getActionError(error) };
  }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/grouped-measurements`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/grouped-measurements/${groupId}`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements`);
  return { error: "" };
}

export async function createUniformParticipantAction(
  workspaceId: string,
  organizationId: string,
  _previousState: UniformActionState,
  formData: FormData,
): Promise<UniformActionState> {
  const user = await requireWorkspaceMatch(workspaceId);
  let participant: Awaited<ReturnType<typeof createUniformParticipant>>;
  try {
    participant = await createUniformParticipant(user.id, organizationId, {
      participantCode: getString(formData, "participantCode"),
      fullName: getString(formData, "fullName"),
      groupLabel: getString(formData, "groupLabel"),
    });
  } catch (error) {
    return { error: getActionError(error) };
  }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people`);
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people/${participant.id}`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people?saved=1`);
}
