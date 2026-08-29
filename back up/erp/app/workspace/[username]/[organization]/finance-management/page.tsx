import Link from "next/link";

export default function FinanceManagementPage() {
  return (
    <div className="min-h-screen bg-[#f4f7f4] px-5 py-10 text-zinc-950">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[#dce4dc] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Module</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17372a]">Finance Management</h1>
        <p className="mt-3 text-sm text-zinc-600">Finance oversight, approvals, and cash controls will be added here.</p>
        <div className="mt-6">
          <Link href="../settings" className="rounded-xl bg-[#17372a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#214d3a]">
            Back to organization
          </Link>
        </div>
      </div>
    </div>
  );
}
