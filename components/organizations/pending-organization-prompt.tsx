import { ArrowRight, CheckCircle2, Clock3, PhoneCall, ShieldCheck } from "lucide-react";
import { SupportTicketTrigger } from "@/components/organizations/support-ticket-trigger";

export function PendingOrganizationPrompt({ organizationId }: { organizationId: string }) {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-950 px-4 py-8 sm:px-6 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12),transparent_30%)]" />
      <div className="relative mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 font-bold tracking-tight text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">C</span>Credence Craft</div>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-400">Organization activation</span>
        </div>

        <div className="grid overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-6 py-10 text-white sm:px-10 sm:py-14">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><Clock3 className="h-7 w-7" /></div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Review in progress</p>
            <h1 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Your organization is nearly ready.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Our team is reviewing your business details. Book a short activation call and we can help you get moving faster.</p>

            <div className="mt-10 space-y-4">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="text-sm font-bold">Business details received</p><p className="mt-1 text-xs text-slate-400">Your organization profile is safely submitted.</p></div></div>
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><div><p className="text-sm font-bold">Secure manual review</p><p className="mt-1 text-xs text-slate-400">A platform specialist will validate and activate your account.</p></div></div>
            </div>
          </section>

          <section className="flex flex-col justify-center bg-white px-6 py-10 sm:px-10 sm:py-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Need it activated quickly?</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">Talk to an activation specialist</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Choose a convenient 30-minute demo slot, or call us directly for urgent activation support.</p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><PhoneCall className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick activation line</p><a href="tel:9567048809" className="mt-1 block text-lg font-bold text-slate-950 hover:text-emerald-700">9567048809</a></div></div>
            </div>

            <div className="mt-6"><SupportTicketTrigger organizationId={organizationId} callbackOnly /></div>
            <p className="mt-4 flex items-center gap-1 text-xs text-slate-400">Appointments are available in 30-minute slots <ArrowRight className="h-3.5 w-3.5" /></p>
          </section>
        </div>
      </div>
    </div>
  );
}
