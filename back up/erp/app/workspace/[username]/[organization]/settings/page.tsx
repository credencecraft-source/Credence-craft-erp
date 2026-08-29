import Link from "next/link";
import { prisma } from "../../../../lib/bootstrap/prisma";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "organization";
}

async function resolveOrganizationId(routeSegment: string) {
  const trimmed = routeSegment.trim();
  if (!trimmed) return null;

  const directMatch = await prisma.organization.findUnique({
    where: { id: trimmed },
    select: { id: true },
  });

  if (directMatch) return directMatch.id;

  const normalized = slugify(trimmed);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Organization"
    WHERE (
      ("shortCode" IS NOT NULL AND lower(regexp_replace(COALESCE("shortCode", ''), '[^a-z0-9]+', '-', 'g')) = ${normalized})
      OR lower(regexp_replace("name", '[^a-z0-9]+', '-', 'g')) = ${normalized}
    )
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

export default async function WorkspaceOrganizationSettingsPage({
  params,
}: {
  params: Promise<{ username: string; organization: string }>;
}) {
  const { username, organization } = await params;
  const decodedUsername = decodeURIComponent(username ?? "");
  const organizationId = await resolveOrganizationId(organization);

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[#17372a]">Organization not found</h1>
        </div>
      </div>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });

  const organizationSegment = encodeURIComponent(org ? org.id : organization);
  const workspaceSlug = slugify(decodedUsername || "workspace");

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <header className="border-b border-[#dce4dc] pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Organization</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Settings</h1>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/masters`} className="rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-5 transition hover:border-emerald-700/50">
            <h2 className="text-base font-semibold text-zinc-950">Masters</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage ERP master records for this organization.</p>
          </Link>

          <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/tenants`} className="rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-5 transition hover:border-emerald-700/50">
            <h2 className="text-base font-semibold text-zinc-950">Tenants</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage tenant profiles, contacts, GST, and operational records.</p>
          </Link>

          <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/permission`} className="rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-5 transition hover:border-emerald-700/50">
            <h2 className="text-base font-semibold text-zinc-950">Permission</h2>
            <p className="mt-1 text-sm text-zinc-500">Role and table permissions for this organization.</p>
          </Link>

          <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/subscription`} className="rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-5 transition hover:border-emerald-700/50">
            <h2 className="text-base font-semibold text-zinc-950">Subscription</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage subscription and billing details.</p>
          </Link>
        </section>
      </div>
    </div>
  );
}
