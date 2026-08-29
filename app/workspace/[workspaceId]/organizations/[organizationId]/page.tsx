import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationsForUser } from "@/lib/organizations/service";

export default async function WorkspaceDirectoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organizations = await getOrganizationsForUser(user.id);

  return (
    <div className="min-h-screen bg-emerald-50/50 p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-xs uppercase tracking-wider text-emerald-800 font-semibold">
              Workspace
            </span>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">
              Welcome back, {user.full_name || "User"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/workspace/${workspaceId}/organizations/new`}
              className="bg-emerald-950 hover:bg-emerald-900 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              New Organization
            </Link>
            <Link
              href={`/workspace/${workspaceId}/settings`}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              Workspace settings
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="bg-red-50 hover:bg-red-100 text-red-600 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                Logout
              </button>
            </form>
          </div>
        </div>

        {/* User Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/50">
            <span className="text-xs text-slate-500 font-medium block mb-1">Profile</span>
            <p className="text-slate-900 font-bold text-lg">{user.profile_name || "N/A"}</p>
          </div>

          <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/50">
            <span className="text-xs text-slate-500 font-medium block mb-1">Email</span>
            <p className="text-slate-900 font-bold text-lg truncate">{user.email}</p>
          </div>

          <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100/50">
            <span className="text-xs text-slate-500 font-medium block mb-1">Status</span>
            <p className="text-emerald-800 font-bold text-lg">
              {user.email_verified ? "Verified" : "Pending"}
            </p>
          </div>
        </div>

        {/* Organizations Section */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Organizations</h2>

          {organizations.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-500 mb-4">No active organizations found.</p>
              <Link
                href={`/workspace/${workspaceId}/organizations/new`}
                className="bg-emerald-900 text-white px-4 py-2 rounded-xl text-sm font-medium"
              >
                Create your first Organization
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100/60 flex flex-col justify-between hover:border-emerald-200 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] tracking-widest font-mono text-slate-400 uppercase">
                        {org.organization_id}
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                        Active
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-1">
                      {org.organization_name}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mb-6">
                      GST: {org.gst_number}
                    </p>
                  </div>

                  <Link
                    href={`/workspace/${workspaceId}/organizations/${org.organization_id}`}
                    className="text-emerald-700 hover:text-emerald-900 font-semibold text-sm inline-flex items-center gap-1 transition-colors"
                  >
                    Open workspace <span className="text-base">&rarr;</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}