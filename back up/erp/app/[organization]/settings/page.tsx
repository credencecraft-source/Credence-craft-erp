import AppShell from "../../components/AppShell";
import { prisma } from "../../lib/bootstrap/prisma";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SA";
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

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ organization: string }>;
}) {
  const { organization } = await params;
  const organizationId = await resolveOrganizationId(organization);
  const orgRecord = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true },
      })
    : null;
  const superAdminMembership = organizationId
    ? await prisma.organizationUser.findFirst({
        where: {
          organizationId,
          OR: [{ isOwner: true }, { role: { isSuperAdmin: true } }],
        },
        include: {
          user: {
            select: { id: true, name: true, profileName: true, email: true },
          },
          role: true,
        },
      })
    : null;
  const superAdmin = superAdminMembership?.user ?? null;
  const orgSlug = orgRecord ? slugify(orgRecord.name) : slugify(organization);
  const workspaceSlug = slugify(superAdmin?.profileName || superAdmin?.name || "workspace");

  return (
    <AppShell>
      <div className="page-frame space-y-5">
        <div className="flex items-end justify-between border-b border-[#dce4dc] pb-5">
          <div>
            <p className="page-kicker">Organization / Settings</p>
            <h1 className="page-title">Settings</h1>
            <p className="page-description">Manage organization-level controls and access setup.</p>
          </div>
          <span className="hidden rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 sm:block">3 sections</span>
        </div>

        <section className="rounded-2xl border border-[#dce4dc] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid size-14 place-items-center rounded-full bg-[#dfeedd] text-lg font-bold text-[#17372a]">
              {getInitials(superAdmin?.name ?? "Super Admin")}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Super admin</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#17372a]">{superAdmin?.name ?? "Super Admin"}</h2>
              <p className="text-sm text-zinc-600">{superAdmin?.email ?? "No email registered"}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Organization settings links">
          <SettingsButton href={`/workspace/${workspaceSlug}/${orgSlug}/settings/masters`} title="Masters" description="Manage ERP master records" />
          <SettingsButton href={`/workspace/${workspaceSlug}/${orgSlug}/settings/permission`} title="Permission" description="Role and permission matrix" />
          <SettingsButton href={`/workspace/${workspaceSlug}/${orgSlug}/settings/subscription`} title="Subscription" description="Billing and plan details" />
        </section>
      </div>
    </AppShell>
  );
}

function SettingsButton({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a href={href} className="surface block p-5 transition hover:border-emerald-700/50 hover:bg-[#f7faf7]">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <span className="mt-4 block text-xs font-semibold text-emerald-800">Open →</span>
    </a>
  );
}
