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
    <main className="min-h-screen bg-[#f5f7f5] p-6 text-zinc-900">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[#dfe6df] bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Workspace Settings</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account and workspace details</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/workspace/${workspaceId}`} className="rounded-xl border border-[#dfe6df] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
              Back to Workspace
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-xl border border-[#dfe6df] bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
                Logout
              </button>
            </form>
          </div>
        </div>

        <form action={updateProfileAction} className="mt-8 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">Full name</span>
              <input
                name="fullName"
                defaultValue={user.full_name}
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </label>

            <label className="block text-sm font-medium text-zinc-700">
              <span className="mb-2 block">Profile name</span>
              <input
                name="profileName"
                defaultValue={user.profile_name}
                className="w-full rounded-xl border border-[#dfe6df] bg-[#f9fbf9] px-3 py-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
              />
            </label>
          </div>

          <button type="submit" className="rounded-xl bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#11291f]">
            Update profile
          </button>
        </form>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-[#dfe6df] bg-[#f9fbf9] p-5">
            <p className="text-sm text-zinc-500">Email</p>
            <p className="mt-2 text-xl font-semibold">{user.email}</p>
          </div>
          <div className="rounded-2xl border border-[#dfe6df] bg-[#f9fbf9] p-5">
            <p className="text-sm text-zinc-500">Last login</p>
            <p className="mt-2 text-xl font-semibold">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Not available"}</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-amber-900">Delete workspace</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            Workspace deletion is restricted and should only be allowed after all dependent resources are removed. This flow is intentionally protected with explicit confirmation and enterprise safety checks.
          </p>
          <button type="button" className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700">
            Delete workspace
          </button>
        </div>
      </div>
    </main>
  );
}