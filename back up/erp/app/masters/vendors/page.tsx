import Link from "next/link";
import AppShell from "../../components/AppShell";
import { prisma } from "../../lib/bootstrap/prisma";
import MasterRecordActions from "../../components/MasterRecordActions";
import { getPaginationArgs } from "../../lib/pagination";

export const dynamic = "force-dynamic";

export default async function VendorMasterPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; limit?: string }> | { page?: string; limit?: string };
}) {
  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const { page, limit, skip } = getPaginationArgs(resolvedParams);

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      select: { id: true, vendorName: true, gstNumber: true, status: true, tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.vendor.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return <AppShell><div className="page-frame space-y-5"><header className="flex flex-col gap-4 border-b border-[#dce4dc] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="page-kicker">Settings / Masters / Data</p><h1 className="page-title">Vendor Master</h1><p className="page-description">Supplier records connected to your entities.</p></div><Link href="/vendors" className="button-primary flex w-full items-center justify-center gap-2 py-3 sm:w-auto"><span className="text-lg leading-none">+</span>Add vendor</Link></header><section className="surface overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"><tr>{["Vendor name", "Entity", "GST number", "Status", "Actions"].map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold sm:px-6">{column}</th>)}</tr></thead><tbody>{vendors.map((vendor) => <tr key={vendor.id} className="border-t border-zinc-100"><td className="px-5 py-4 font-semibold text-zinc-800 sm:px-6">{vendor.vendorName}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{vendor.tenant.name}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{vendor.gstNumber || "—"}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">{vendor.status}</td><td className="px-5 py-4 sm:px-6"><MasterRecordActions editHref={`/vendors?edit=${vendor.id}`} deleteUrl={`/api/vendors/${vendor.id}`} label={vendor.vendorName} /></td></tr>)}</tbody></table>{vendors.length === 0 && <p className="px-5 py-10 text-center text-sm text-zinc-500">No vendors yet.</p>}</div>{totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600"><Link href={page > 1 ? `/masters/vendors?page=${page - 1}` : `/masters/vendors?page=1`} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40" aria-disabled={page <= 1}>Previous</Link><span>Page {page} of {totalPages}</span><Link href={page < totalPages ? `/masters/vendors?page=${page + 1}` : `/masters/vendors?page=${totalPages}`} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600 transition hover:border-emerald-700/40 hover:text-emerald-800 disabled:pointer-events-none disabled:opacity-40" aria-disabled={page >= totalPages}>Next</Link></div>}</section></div></AppShell>;
}
