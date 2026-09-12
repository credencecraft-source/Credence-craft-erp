"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, X } from "lucide-react";

type SupportTicketTriggerProps = { organizationId: string; callbackOnly?: boolean };

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createTimeSlots() {
  return Array.from({ length: 19 }, (_, index) => {
    const minutes = 9 * 60 + index * 30;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(2024, 0, 1, hour, minute));
    return { value, label };
  });
}

export function SupportTicketTrigger({ organizationId, callbackOnly = false }: SupportTicketTriggerProps) {
  const [open, setOpen] = useState(false);
  const [requestType] = useState<"TICKET" | "CALLBACK">(callbackOnly ? "CALLBACK" : "TICKET");
  const [subject] = useState(callbackOnly ? "Book a demo request" : "Support request");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const dateOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return {
      value: dateValue(date),
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short", month: "short", day: "numeric" }).format(date),
    };
  }), []);
  const timeOptions = useMemo(() => createTimeSlots(), []);

  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/support-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType, subject, description, priority, callbackDate, callbackTime }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to book your appointment.");
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to book your appointment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMessage(""); setSubmitted(false); }} className={callbackOnly ? "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400" : "flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"} title={callbackOnly ? "Book a demo" : "Contact support"} aria-label={callbackOnly ? "Book a demo" : "Contact support"}>
        {callbackOnly ? "Book a demo" : "Support"}
      </button>

      {open && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Credence Craft Concierge</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Book your activation call</h2><p className="mt-2 text-sm leading-6 text-slate-300">Choose a convenient 30-minute slot and our team will help activate your organization.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close booking dialog" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
          </div>

          {submitted ? <div className="px-6 py-12 text-center sm:px-8"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" /><h3 className="mt-5 text-xl font-bold text-slate-900">Appointment request received</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Our activation team will contact you for the selected slot. You can also call 9567048809 for urgent assistance.</p><button type="button" onClick={() => setOpen(false)} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">Done</button></div> : <form onSubmit={submitTicket} className="space-y-5 px-6 py-6 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700"><span className="mb-2 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-600" />Preferred date</span><select required value={callbackDate} onChange={(event) => setCallbackDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"><option value="">Select a date</option>{dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="block text-sm font-semibold text-slate-700"><span className="mb-2 flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-600" />30-minute time slot</span><select required value={callbackTime} onChange={(event) => setCallbackTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"><option value="">Select a time</option>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            {!callbackOnly && <><input required minLength={3} maxLength={255} defaultValue={subject} readOnly placeholder="Subject" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-500" /><select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-500"><option value="LOW">Low priority</option><option value="NORMAL">Normal priority</option><option value="HIGH">High priority</option><option value="URGENT">Urgent</option></select></>}
            <label className="block text-sm font-semibold text-slate-700">What would you like to discuss?<textarea required minLength={10} maxLength={5000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell us what you need help activating..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" /></label>
            {message && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{message}</p>}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5"><a href="tel:9567048809" className="text-sm font-semibold text-slate-600 hover:text-emerald-700">Call 9567048809</a><button disabled={saving} type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50">{saving ? "Booking..." : "Request appointment"}</button></div>
+          </form>}
+        </div>
+      </div>}
+    </>
  );
}
