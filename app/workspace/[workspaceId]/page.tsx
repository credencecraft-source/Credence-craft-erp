import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { logoutSession, requireSessionUser } from "@/lib/auth-session";
import { listOrganizationsForUser } from "@/lib/organizations/service";
import { prisma } from "@/lib/prisma";

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

  const organizations = await listOrganizationsForUser(user.id);

  return (
    <main >
      <div >
        <div >
          {successMessage && (
            <div >
              Organization created successfully.
            </div>
          )}

          <div >
            <div>
              <p >Workspace</p>
              <h1 >
                Welcome back, {user.full_name}
              </h1>
            </div>
            <div >
              <Link
                href="/workspace/organizations/new"
                
              >
                New Organization
              </Link>
              <Link
                href={`/workspace/${workspaceId}/settings`}
                
              >
                Workspace settings
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  
                >
                  Logout
                </button>
              </form>
            </div>
          </div>

          <div >
            {[
              { label: "Profile", value: user.profile_name },
              { label: "Email", value: user.email },
              { label: "Status", value: user.email_verified ? "Verified" : "Pending" },
            ].map((card) => (
              <div
                key={card.label}
                
              >
                <p >{card.label}</p>
                <h2 >{card.value}</h2>
              </div>
            ))}
          </div>

          <div >
            <div >
              <h2 >Organizations</h2>
            </div>

            {organizations.length === 0 ? (
              <div >
                No organizations yet. Create your first business entity to begin ERP operations.
              </div>
            ) : (
              <div >
                {organizations.map((organization) => (
                  <Link
                    key={organization.id}
                    href={`/workspace/${workspaceId}/organizations/${organization.organization_id}`}
                    
                  >
                    <div >
                      <span >
                        {organization.organization_id}
                      </span>
                      <span >
                        Active
                      </span>
                    </div>
                    <h3 >
                      {organization.organization_name}
                    </h3>
                    <p >GST: {organization.gst_number}</p>
                    <div >
                      <span>Open workspace</span>
                      <span aria-hidden="true" >
                        →
                      </span>
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