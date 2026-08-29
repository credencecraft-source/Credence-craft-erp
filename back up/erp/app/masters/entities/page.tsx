import Link from "next/link";
import AppShell from "../../components/AppShell";
import { prisma } from "../../lib/bootstrap/prisma";
import MasterRecordActions from "../../components/MasterRecordActions";
import { getPaginationArgs } from "../../lib/pagination";

export const dynamic = "force-dynamic";

export default async function EntityMasterPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; limit?: string }> | { page?: string; limit?: string };
}) {
  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const { page, limit, skip } = getPaginationArgs(resolvedParams);

  const [entities, total] = await Promise.all([
    prisma.tenant.findMany({
      select: { id: true, name: true, email: true, city: true, gstNumber: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tenant.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return <AppShell><div className="page-frame space-y-5"><MasterHeader title="Entity" description="Business entities used by the ERP." addHref="/onboarding" addLabel="Add entity" /><DataTable columns={["Name", "Email", "City", "GST", "Actions"]}>{entities.map((entity) => <tr key={entity.id} className="border-t border-zinc-100"><td className="px-5 py-4 font-semibold text-zinc-800 sm:px-6">{entity.name}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{entity.email || "—"}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{entity.city || "—"}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{entity.gstNumber || "—"}</td><td className="px-5 py-4 sm:px-6"><MasterRecordActions editHref={`/onboarding?edit=${entity.id}`} deleteUrl={`/api/tenants?id=${entity.id}`} label={entity.name} /></td></tr>)}</DataTable>{totalPages > 1 && <PaginationBar page={page} totalPages={totalPages} baseUrl="/masters/entities" />}</div></AppShell>;
}

function MasterHeader({ title, description, addHref, addLabel }: { title: string; description: string; addHref: string; addLabel: string }) { return <header className="flex flex-col gap-4 border-b border-[#dce4dc] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="page-kicker">Settings</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div><Link href={addHref} className="button-primary flex w-full items-center justify-center gap-2 py-3 sm:w-auto"><span className="text-lg leading-none">+</span>{addLabel}</Link></header>; }

function DataTable({ columns, children }: { columns: string[]; children: React.ReactNode }) { return <section className="surface overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"><tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold sm:px-6">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div></section>; }

function PaginationBar({ page, totalPages, baseUrl }: { page: number; totalPages: number; baseUrl: string }) {
  const previousHref = page > 1 ? `${baseUrl}?page=${page - 1}` : `${baseUrl}?page=1`;
  const nextHref = page < totalPages ? `${baseUrl}?page=${page + 1}` : `${baseUrl}?page=${totalPages}`;

  return <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600"><Link href={previousHref} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40" aria-disabled={page <= 1}>Previous</Link><span>Page {page} of {totalPages}</span><Link href={nextHref} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40" aria-disabled={page >= totalPages}>Next</Link></div>;
}
