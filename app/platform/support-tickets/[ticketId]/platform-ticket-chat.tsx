"use client";

import { useState } from "react";

type Message = { id: string; body: string; senderType: string; senderName: string; createdAt: string };

export default function PlatformTicketChat({ ticketId, initialMessages }: { ticketId: string; adminId: string; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError("");
    const response = await fetch(`/api/platform/support-tickets/${ticketId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const payload = await response.json();
    setSending(false);
    if (!response.ok) { setError(payload.error || "Unable to send message."); return; }
    setMessages((current) => [...current, { id: payload.message.id, body: payload.message.body, senderType: "PLATFORM", senderName: "Support", createdAt: payload.message.created_at }]);
    setBody("");
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="border-b border-slate-100 pb-4"><h2 className="text-lg font-bold text-slate-900">Customer conversation</h2><p className="mt-1 text-sm text-slate-500">Reply directly to the organization from this ticket.</p></div><div className="max-h-[480px] space-y-3 overflow-y-auto py-5">{messages.length === 0 ? <p className="text-sm text-slate-500">No replies yet.</p> : messages.map((message) => <div key={message.id} className={`max-w-2xl rounded-2xl px-4 py-3 ${message.senderType === "PLATFORM" ? "ml-auto bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}><div className="flex justify-between gap-4 text-xs font-semibold opacity-70"><span>{message.senderName}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p></div>)}</div><form onSubmit={sendMessage} className="border-t border-slate-100 pt-4"><textarea required minLength={1} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Write a reply to the customer..." className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-emerald-500" />{error && <p className="mt-2 text-sm text-red-600">{error}</p>}<div className="mt-3 flex justify-end"><button disabled={sending} type="submit" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{sending ? "Sending..." : "Send reply"}</button></div></form></section>;
}
