import Link from "next/link";
import { ShieldAlert, ArrowLeft, Zap } from "lucide-react";

interface PageProps {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<{ message?: string }>;
}

export default async function AccessBlockedPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  
  const { workspaceId, organizationId } = resolvedParams;
  const displayMessage = resolvedSearch.message || "Access to this module/feature is restricted on your current plan.";
  const orgHome = `/dashboard/${workspaceId}/organizations/${organizationId}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-100">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-5 border border-rose-100 shadow-xs">
          <ShieldAlert className="h-7 w-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-slate-900 mb-2">
          Access Restricted
        </h1>
        
        <p className="text-xs text-slate-600 leading-relaxed mb-6 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          {decodeURIComponent(displayMessage)}
        </p>

        <div className="flex flex-col gap-2.5">
          <Link
            href={orgHome}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Organization Home
          </Link>

          <Link
            href={`${orgHome}/settings/pricing/current-plan`}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition border border-emerald-200"
          >
            <Zap className="h-3.5 w-3.5" />
            Upgrade Plan & Unlock
          </Link>
        </div>
      </div>
    </div>
  );
}