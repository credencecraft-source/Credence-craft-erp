import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  getWorkspaceUser,
  deleteWorkspaceUser,
  updateWorkspaceUser,
  WorkspaceUserServiceError,
  type UpdateWorkspaceUserInput,
} from "@/lib/services/platform/workspace-user-service";
import WorkspaceUserDetails from "./workspace-user-details";

export default async function WorkspaceUserDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { userId } = await params;
  const query = (await searchParams) ?? {};
  const [user, platformAdmin] = await Promise.all([
    getWorkspaceUser(userId),
    requirePlatformSessionAdmin(),
  ]);
  if (!user) notFound();
  const workspaceUserId = user.id;

  async function removeWorkspaceUser() {
    "use server";

    try {
      await deleteWorkspaceUser(workspaceUserId);
    } catch (error) {
      if (error instanceof WorkspaceUserServiceError) {
        redirect(`/platform/workspace-users/${encodeURIComponent(workspaceUserId)}?error=${encodeURIComponent(error.message)}`);
      }
      throw error;
    }

    revalidatePath("/platform/workspace-users");
    redirect("/platform/workspace-users");
  }

  async function saveWorkspaceUser(input: UpdateWorkspaceUserInput) {
    "use server";

    try {
      await updateWorkspaceUser(input);
      revalidatePath("/platform/workspace-users");
      revalidatePath(`/platform/workspace-users/${encodeURIComponent(workspaceUserId)}`);
      return { ok: true as const };
    } catch (error) {
      if (error instanceof WorkspaceUserServiceError) {
        return { ok: false as const, error: error.message };
      }
      return {
        ok: false as const,
        error: "Unable to save workspace user details. Please try again.",
      };
    }
  }

  return (
    <Page className="max-w-5xl">
      <Section>
        <WorkspaceUserDetails
          user={{
            id: user.id,
            fullName: user.full_name,
            canDelete: user.canDelete && platformAdmin.role === "SUPER_ADMIN",
            profileName: user.profile_name,
            email: user.email,
            emailVerified: user.email ? user.email_verified : false,
            mobileNumber: user.mobile_number,
            mobileVerified: Boolean(user.mobile_number && user.mobile_verified_at),
            createdAt: user.created_at.toLocaleString(),
            lastLogin: user.last_login_at?.toLocaleString() ?? "Never",
            organisations: user.organisations.map((organization) => ({
              id: organization.id,
              name: organization.organization_name,
            })),
            totalRecords: user.totalRecords,
            status: user.status,
          }}
          deleteWorkspaceUser={removeWorkspaceUser}
          deleteError={query.error}
          saveWorkspaceUser={saveWorkspaceUser}
        />
      </Section>
    </Page>
  );
}
