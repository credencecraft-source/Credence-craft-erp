"use client";

import { useMemo, useState } from "react";
import { MessageSquareText, StickyNote } from "lucide-react";

import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";

type Message = { id: string; body: string; senderType: string; senderName: string; createdAt: string };
type Tab = "chat" | "notes";

export default function PlatformTicketChat(props: { ticketId: string; initialMessages: Message[]; leadTicket?: boolean }) {
  return <TicketChat key={props.ticketId} {...props} />;
}

function TicketChat({ ticketId, initialMessages, leadTicket = false }: { ticketId: string; initialMessages: Message[]; leadTicket?: boolean }) {
  const [messages, setMessages] = useState(initialMessages);
  const [activeTab, setActiveTab] = useState<Tab>(leadTicket ? "notes" : "chat");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const internal = activeTab === "notes";
  const visibleMessages = useMemo(
    () => messages.filter((message) => internal ? message.senderType === "INTERNAL" : message.senderType !== "INTERNAL"),
    [messages, internal],
  );

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/support-tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, internal }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || (internal ? "Unable to save note." : "Unable to send reply."));
      setMessages((current) => [...current, {
        id: payload.message.id,
        body: payload.message.body,
        senderType: internal ? "INTERNAL" : "PLATFORM",
        senderName: "You",
        createdAt: payload.message.created_at,
      }]);
      setBody("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : internal ? "Unable to save note." : "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex border-b border-slate-200">
        {!leadTicket && <Button type="button" variant="ghost" onClick={() => { setActiveTab("chat"); setError(""); }} aria-pressed={!internal} className={`min-h-0 rounded-none border-b-2 px-4 py-3 text-sm ${!internal ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><MessageSquareText className="h-4 w-4" /> Customer chat</Button>}
        <Button type="button" variant="ghost" onClick={() => { setActiveTab("notes"); setError(""); }} aria-pressed={internal} className={`min-h-0 rounded-none border-b-2 px-4 py-3 text-sm ${internal ? "border-amber-500 text-amber-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><StickyNote className="h-4 w-4" /> Private notes <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px]">{messages.filter((message) => message.senderType === "INTERNAL").length}</span></Button>
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-xs text-slate-500">{internal ? "Only platform admins can see notes. Notes are never included in customer ticket responses." : "Replies are visible to members of the organization."}</p>
        <div className="mt-4 max-h-[25rem] min-h-32 space-y-3 overflow-y-auto">
          {visibleMessages.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{internal ? "No private notes yet." : "No customer replies yet."}</p> : visibleMessages.map((message) => <div key={message.id} className={`max-w-2xl rounded-xl px-4 py-3 ${internal ? "border border-amber-200 bg-amber-50 text-amber-950" : message.senderType === "PLATFORM" ? "ml-auto bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}><div className="flex justify-between gap-4 text-xs font-semibold opacity-70"><span>{message.senderName}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p></div>)}
        </div>
        <form onSubmit={sendMessage} className="mt-4 border-t border-slate-100 pt-4">
          <label className="sr-only" htmlFor={`ticket-message-${ticketId}`}>{internal ? "Private note" : "Reply to customer"}</label>
          <Textarea id={`ticket-message-${ticketId}`} required minLength={1} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder={internal ? "Write a private note for the support team..." : "Write a reply to the customer..."} />
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end"><Button disabled={sending} type="submit" className={internal ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}>{sending ? "Saving..." : internal ? "Add private note" : "Send reply"}</Button></div>
        </form>
      </div>
    </section>
  );
}
