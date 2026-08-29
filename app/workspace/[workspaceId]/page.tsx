import Link from "next/link";
import { logoutSession, requireSessionUser } from "@/lib/auth-session";
import { listOrganizationsForUser } from "@/lib/organizations/service";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

const isDevBypass = process.env.USE_DEV_USER_STORE === "true" || !process.env.DATABASE_URL;

export default async function WorkspaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ success?: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();
  const successMessage = (await searchParams)?.success === "organization-created";

  async function logoutAction() {
    "use server";

    await logoutSession();
    redirect("/");
  }

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

  let organizations: Array<{
    id: string;
    organization_id: string;
    organization_name: string;
    gst_number: string;
  }> = [];

  organizations = await listOrganizationsForUser(user.id);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_22%),linear-gradient(180deg,#edf4ef_0%,#f8faf9_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[30px] border border-slate-200/80 bg-white/80 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8">
          {successMessage && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm">
              Organization created successfully.
            </div>
          )}

          <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700">Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900">Welcome back, {user.full_name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/workspace/organizations/new" className="rounded-xl bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,55,42,0.2)] transition hover:bg-[#214d3a]">
                New Organization
              </Link>
              <Link href={`/workspace/${workspaceId}/settings`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white">
                Workspace settings
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100">
                  Logout
                </button>
              </form>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { label: "Profile", value: user.profile_name },
              { label: "Email", value: user.email },
              { label: "Status", value: user.email_verified ? "Verified" : "Pending" },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50 p-5 shadow-sm">
                <p className="text-sm text-slate-500">{card.label}</p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-slate-900">{card.value}</h2>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-900">Organizations</h2>
            </div>

            {organizations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-600 shadow-inner">
                No organizations yet. Create your first business entity to begin ERP operations.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {organizations.map((organization) => (
                  <Link
                    key={organization.id}
                    href={`/workspace/${workspaceId}/organizations/${organization.organization_id}`}
                    className="group block rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-600 hover:shadow-[0_20px_40px_rgba(16,185,129,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700">{organization.organization_id}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">Active</span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-900">{organization.organization_name}</h3>
                    <p className="mt-3 text-sm text-slate-500">GST: {organization.gst_number}</p>
                    <div className="mt-5 flex items-center justify-between text-sm font-medium text-emerald-700">
                      <span>Open workspace</span>
                      <span aria-hidden="true">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
