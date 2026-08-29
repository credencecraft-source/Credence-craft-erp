import Link from "next/link";

export default async function WorkspaceOrganizationMastersPage({
  params,
}: {
  params: Promise<{ username: string; organization: string }>;
}) {
  const { username, organization } = await params;
  const workspaceSlug = decodeURIComponent(username ?? "");
  const organizationSegment = encodeURIComponent(organization ?? "");

  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <header className="border-b border-[#dce4dc] pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Organization / Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Masters</h1>
          <p className="mt-2 text-sm text-zinc-600">Manage the ERP master records for this organization.</p>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Organization master data">
          <MasterButton href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/masters/entities`} title="Entity" description="Business entity records" />
          <MasterButton href={`/workspace/${workspaceSlug}/${organizationSegment}/settings/masters/vendors`} title="Vendor" description="Supplier records" />
        </section>
      </div>
    </div>
  );
}

function MasterButton({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="block rounded-2xl border border-[#dce4dc] bg-[#f7faf7] p-5 transition hover:border-emerald-700/50 hover:bg-[#f7faf7]">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <span className="mt-4 block text-xs font-semibold text-emerald-800">Open data →</span>
    </Link>
  );
}
