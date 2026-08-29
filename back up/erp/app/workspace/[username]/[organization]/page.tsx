import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/bootstrap/prisma";

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

export default async function WorkspaceOrganizationPage({
  params,
}: {
  params: Promise<{ username: string; organization: string }>;
}) {
  const { username, organization } = await params;
  const resolvedUsername = decodeURIComponent(username ?? "");
  const workspaceSlug = slugify(resolvedUsername || "workspace");
  const organizationId = await resolveOrganizationId(organization);

  if (!organizationId) {
    notFound();
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      shortCode: true,
      createdAt: true,
      status: true,
    },
  });

  if (!org) {
    notFound();
  }

  const organizationSegment = encodeURIComponent(org.id);
  const workspacePath = `/workspace/${workspaceSlug}`;

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#dce4dc] bg-[#17372a] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/75">Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Organisation dashboard</h1>
            <p className="mt-2 text-sm text-emerald-100/80">{org.name}{org.shortCode ? ` · ${org.shortCode}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Profile Name</div>
              <div className="mt-1 text-sm font-medium text-white">{decodeURIComponent(username || "workspace")}</div>
            </div>
            <Link href={workspacePath} className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/10">
              Back to workspace
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-[#dfe8df] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#eaf7ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">{org.status || "Active"}</span>
            <span className="text-sm text-zinc-500">Created {new Date(org.createdAt).toLocaleDateString()}</span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard title="Order Management" description="Orders, bookings, samples, and production workflows." href={`/workspace/${workspaceSlug}/${organizationSegment}/order-management/merchandising`} />
          <ModuleCard title="Factory Management" description="Factory planning, production, and resource operations." href={`/workspace/${workspaceSlug}/${organizationSegment}/factory-management`} />
          <ModuleCard title="Finance Management" description="Finance oversight, approvals, and operational controls." href={`/workspace/${workspaceSlug}/${organizationSegment}/finance-management`} />
          <ModuleCard title="Retail" description="Retail operations, demand, and store-level monitoring." href={`/workspace/${workspaceSlug}/${organizationSegment}/retail`} />
          <ModuleCard title="Distribution" description="Outbound movement, logistics, and distribution coordination." href={`/workspace/${workspaceSlug}/${organizationSegment}/distribution`} />
          <ModuleCard title="Settings and Control" description="Organization setup, permissions, and configuration controls." href={`/workspace/${workspaceSlug}/${organizationSegment}/settings`} />
        </section>
      </div>
    </div>
  );
}

function ModuleCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-[#dfe8df] bg-white p-5 shadow-sm transition hover:border-emerald-700/40 hover:bg-[#f7faf7]">
      <h2 className="text-lg font-semibold text-[#17372a]">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.08em] text-emerald-800">Open →</span>
    </Link>
  );
}
