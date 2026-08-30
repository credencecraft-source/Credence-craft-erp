import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, requireSessionUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const isDevBypass = process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL;

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  let workspaceOwner: { id: string; workspace_id?: string } | null = null;

  if (isDevBypass) {
    workspaceOwner = user.workspace_id === workspaceId ? user : null;
  } else {
    try {
      workspaceOwner = await prisma.workspaceUser.findFirst({
        where: { workspace_id: workspaceId },
      });
    } catch {
      workspaceOwner = null;
    }
  }

  if (!workspaceOwner || workspaceOwner.id !== user.id) {
    notFound();
  }

  async function logoutAction() {
    "use server";
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    revalidatePath("/");
    redirect("/");
  }

  async function updateProfileAction(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") || "").trim();
    const profileName = String(formData.get("profileName") || "").trim();

    if (!fullName || !profileName) {
      redirect(`/workspace/${workspaceId}/settings`);
    }

    await prisma.workspaceUser.update({
      where: { id: user.id },
      data: {
        full_name: fullName,
        profile_name: profileName,
      },
    });

    revalidatePath(`/workspace/${workspaceId}/settings`);
    redirect(`/workspace/${workspaceId}/settings`);
  }

  return (
    <main >
      <div >
        <div >
          <div>
            <p >Workspace Settings</p>
            <h1 >Account and workspace details</h1>
          </div>
          <div >
            <Link href={`/workspace/${workspaceId}`} >
              Back to Workspace
            </Link>
            <form action={logoutAction}>
              <button type="submit" >
                Logout
              </button>
            </form>
          </div>
        </div>

        <form action={updateProfileAction} >
          <div >
            <label >
              <span >Full name</span>
              <input
                name="fullName"
                defaultValue={user.full_name}
                
              />
            </label>

            <label >
              <span >Profile name</span>
              <input
                name="profileName"
                defaultValue={user.profile_name}
                
              />
            </label>
          </div>

          <button type="submit" >
            Update profile
          </button>
        </form>

        <div >
          <div >
            <p >Email</p>
            <p >{user.email}</p>
          </div>
          <div >
            <p >Last login</p>
            <p >{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Not available"}</p>
          </div>
        </div>

        <div >
          <h2 >Delete workspace</h2>
          <p >
            Workspace deletion is restricted and should only be allowed after all dependent resources are removed. This flow is intentionally protected with explicit confirmation and enterprise safety checks.
          </p>
          <button type="button" >
            Delete workspace
          </button>
        </div>
      </div>
    </main>
  );
}