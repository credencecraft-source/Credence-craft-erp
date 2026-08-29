import AppShell from "../../../components/AppShell";
import { prisma } from "../../../lib/bootstrap/prisma";
import { PermissionEditor } from "./PermissionEditor";

async function getLiveTableNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name NOT IN ('_prisma_migrations')
    ORDER BY table_name ASC
  `;

  return rows.map((row) => row.table_name);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  return rows[0]?.id ?? trimmed;
}

export default async function OrganizationPermissionPage({
  params,
}: {
  params: Promise<{ organization: string }>;
}) {
  const { organization } = await params;
  const organizationId = await resolveOrganizationId(organization);
  const tables = await getLiveTableNames();

  return (
    <AppShell>
      <div className="page-frame space-y-6">
        <header className="flex flex-col gap-3 border-b border-[#dce4dc] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Organization / Settings</p>
            <h1 className="page-title">Permission</h1>
            <p className="page-description">Role and table permissions for this organization. The table list is loaded directly from the database.</p>
          </div>
          <span className="rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">Role matrix</span>
        </header>

        <PermissionEditor organizationId={organizationId ?? organization} tables={tables} />
      </div>
    </AppShell>
  );
}
