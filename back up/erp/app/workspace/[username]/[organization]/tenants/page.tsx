import Link from "next/link";
import AppShell from "../../../../components/AppShell";
import { prisma } from "../../../../lib/bootstrap/prisma";
import { getPaginationArgs } from "../../../../lib/pagination";

export const dynamic = "force-dynamic";

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

export default async function OrganizationTenantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; organization: string }>;
  searchParams?: Promise<{ page?: string; limit?: string }> | { page?: string; limit?: string };
}) {
  const { username, organization } = await params;
  const decodedUsername = decodeURIComponent(username ?? "");
  const organizationId = await resolveOrganizationId(organization);

  if (!organizationId) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl rounded-3xl border border-[#dce4dc] bg-white p-8 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Tenants</p>
          <h1 className="mt-3 text-3xl font-semibold text-[#17372a]">Organization not found</h1>
        </div>
      </AppShell>
    );
  }

  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const { page, limit, skip } = getPaginationArgs(resolvedParams);

  const [org, tenants, total] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, shortCode: true },
    }),
    prisma.tenant.findMany({
      where: { organizationId },
      include: { gstRegisteredState: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tenant.count({ where: { organizationId } }),
  ]);

  const workspaceSlug = slugify(decodedUsername || "workspace");
  const organizationSegment = encodeURIComponent(org?.id ?? organization);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#dce4dc] bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Organization / Tenants</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Tenant dashboard</h1>
            <p className="mt-2 text-sm text-zinc-600">{org?.name ?? "Organization"}{org?.shortCode ? ` · ${org.shortCode}` : ""}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link href={`/workspace/${workspaceSlug}/${organizationSegment}`} className="rounded-xl border border-[#dce4dc] bg-[#f7faf7] px-4 py-2.5 text-sm font-semibold text-[#17372a] transition hover:border-emerald-700/50">
              Overview
            </Link>
            <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/settings`} className="rounded-xl border border-[#dce4dc] bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#214d3a]">
              Settings
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total tenants" value={String(total)} accent="bg-[#eaf7ee] text-emerald-800" />
          <StatCard label="Active status" value="Live" accent="bg-[#edf4ff] text-blue-700" />
          <StatCard label="Module" value="Tenants" accent="bg-[#fff3d9] text-amber-700" />
        </section>

        <section className="rounded-3xl border border-[#dce4dc] bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e7ece7] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[#17372a]">Tenant list</h2>
              <p className="text-sm text-zinc-500">All tenant records for this organization</p>
            </div>
            <Link href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/masters/entities?tenant=add`} className="inline-flex items-center justify-center rounded-xl bg-[#17372a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#214d3a]">
              + Add tenant
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f7faf7] text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Name</th>
                  <th className="px-5 py-3 sm:px-6">Display</th>
                  <th className="px-5 py-3 sm:px-6">Email</th>
                  <th className="px-5 py-3 sm:px-6">Phone</th>
                  <th className="px-5 py-3 sm:px-6">City</th>
                  <th className="px-5 py-3 sm:px-6">State</th>
                  <th className="px-5 py-3 sm:px-6">GST</th>
                  <th className="px-5 py-3 sm:px-6">Country</th>
                  <th className="px-5 py-3 sm:px-6">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-zinc-500 sm:px-6">
                      No tenants found for this organization.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-t border-zinc-100 hover:bg-[#f9fbf9]">
                      <td className="px-5 py-4 font-semibold text-[#17372a] sm:px-6">{tenant.name}</td>
                      <td className="px-5 py-4 text-zinc-700 sm:px-6">{tenant.displayName || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.email || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.phone || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.city || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.state || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.gstNumber || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{tenant.country || "—"}</td>
                      <td className="px-5 py-4 text-zinc-600 sm:px-6">{new Date(tenant.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-[#e7ece7] bg-[#fafcfb] px-5 py-3 text-sm text-zinc-600">
              <Link
                href={`/workspace/${workspaceSlug}/${organizationSegment}/tenants?page=${Math.max(1, page - 1)}`}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40"
                aria-disabled={page <= 1}
              >
                Previous
              </Link>
              <span>Page {page} of {totalPages}</span>
              <Link
                href={`/workspace/${workspaceSlug}/${organizationSegment}/tenants?page=${Math.min(totalPages, page + 1)}`}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40"
                aria-disabled={page >= totalPages}
              >
                Next
              </Link>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-[#dce4dc] bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${accent}`}>{label}</div>
      <div className="mt-3 text-2xl font-semibold text-[#17372a]">{value}</div>
    </div>
  );
}
