import AppShell from "../../../components/AppShell";

export default function OrganizationMastersPage() {
  return (
    <AppShell>
      <div className="page-frame space-y-5">
        <div className="flex items-end justify-between border-b border-[#dce4dc] pb-5">
          <div>
            <p className="page-kicker">Organization / Settings</p>
            <h1 className="page-title">Masters</h1>
            <p className="page-description">Manage the ERP master records for this organization.</p>
          </div>
          <span className="hidden rounded-full border border-[#cddbcf] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 sm:block">2 items</span>
        </div>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Organization master data">
          <MasterButton href="../masters/entities" title="Entity" description="Business entity records" />
          <MasterButton href="../masters/vendors" title="Vendor" description="Supplier records" />
        </section>
      </div>
    </AppShell>
  );
}

function MasterButton({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <a href={href} className="surface block p-5 transition hover:border-emerald-700/50 hover:bg-[#f7faf7]">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
      <span className="mt-4 block text-xs font-semibold text-emerald-800">Open data →</span>
    </a>
  );
}
