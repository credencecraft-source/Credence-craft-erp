"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, LoaderCircle, Send, Sparkles, X } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createCopilotChatRequest, type CopilotChatTurn } from "./ai-copilot-chat-state";

type ChatMessage = CopilotChatTurn & { id: number };

type CopilotResponse = {
  reply?: unknown;
  response?: unknown;
};

function renderInlineMarkdown(text: string, blockKey: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    const key = `${blockKey}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-xs">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3 key={`heading-${index}`} className="font-semibold text-slate-900">
          {renderInlineMarkdown(heading[2], `heading-${index}`)}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        const itemText = lines[index].trim().replace(/^[-*]\s+/, "");
        items.push(<li key={`item-${index}`}>{renderInlineMarkdown(itemText, `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`} className="list-disc space-y-1 pl-5">{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        const itemText = lines[index].trim().replace(/^\d+\.\s+/, "");
        items.push(<li key={`item-${index}`}>{renderInlineMarkdown(itemText, `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`list-${index}`} className="list-decimal space-y-1 pl-5">{items}</ol>);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|```|[-*]\s+|\d+\.\s+)/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
        {renderInlineMarkdown(paragraphLines.join(" "), `paragraph-${index}`)}
      </p>,
    );
  }

  return <div className="space-y-2 break-words text-sm leading-6 text-slate-700">{blocks}</div>;
}

function getResponseError(status: number): string {
  if (status === 401) return "Sign in again to use AI Copilot.";
  if (status === 403) return "You do not have access to this organization's Copilot.";
  if (status === 404) return "The AI Copilot service endpoint is not available.";
  if (status === 429) return "AI Copilot is busy. Wait a moment and try again.";
  if (status >= 500) return "AI Copilot is temporarily unavailable. Try again later.";
  return "AI Copilot could not process that message.";
}

export default function AiCopilotDrawer({
  open,
  organizationId,
  currentModule,
  onClose,
}: {
  open: boolean;
  organizationId: string;
  currentModule: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ));
    if (!focusable.length) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const sendMessage = async (candidate = input) => {
    const message = candidate.trim();
    if (!message || isSending) return;

    const history: CopilotChatTurn[] = messages.map(({ role, content }) => ({ role, content }));
    const request = createCopilotChatRequest(message, organizationId, currentModule, history);
    const userMessage: ChatMessage = { id: ++messageIdRef.current, role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError(null);
    setIsSending(true);

    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/ai/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        setError(getResponseError(response.status));
        return;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setError("AI Copilot returned an unreadable response. Try again.");
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        setError("AI Copilot returned an invalid response. Try again.");
        return;
      }
      const data = payload as CopilotResponse;
      const reply = typeof data.reply === "string"
        ? data.reply.trim()
        : typeof data.response === "string"
          ? data.response.trim()
          : "";
      if (!reply) {
        setError("AI Copilot returned an empty response. Try again.");
        return;
      }
      setMessages((current) => [
        ...current,
        { id: ++messageIdRef.current, role: "assistant", content: reply },
      ]);
    } catch {
      if (!controller.signal.aborted) {
        setError("Unable to connect to AI Copilot. Check your connection and try again.");
      }
    } finally {
      if (!controller.signal.aborted) setIsSending(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="ai-copilot-backdrop"
            className="fixed inset-0 z-40 bg-slate-950/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            aria-hidden="true"
            onClick={onClose}
          />
          <motion.aside
            key="ai-copilot-panel"
            id="ai-copilot-drawer"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-copilot-title"
            tabIndex={-1}
            className="fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-full min-w-0 flex-col border-l border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)] focus:outline-none"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.22 }}
            onKeyDown={handleKeyDown}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--erp-border)] p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="ai-copilot-title" className="text-sm font-bold text-slate-900">AI Copilot</h2>
                  <Badge className="mt-1 max-w-full truncate px-2 py-0.5 text-[10px]">
                    {currentModule}
                  </Badge>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close AI Copilot"
                title="Close AI Copilot"
                onClick={onClose}
                className="h-9 w-9 shrink-0 p-0 text-slate-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </header>

            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
              role="log"
              aria-label="AI Copilot conversation"
              aria-live="polite"
            >
              {messages.length === 0 && (
                <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-800">How can I help?</p>
                  <p className="mt-1 max-w-64 text-xs leading-5 text-slate-500">
                    Ask a question about {currentModule}. Your conversation is scoped to this organization.
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <article
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[var(--erp-brand-soft)] text-slate-900"
                        : "rounded-bl-md bg-[var(--erp-surface-soft)] text-slate-700"
                    }`}
                    aria-label={message.role === "user" ? "Your message" : "AI Copilot response"}
                  >
                    {message.role === "assistant"
                      ? <MarkdownMessage content={message.content} />
                      : <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>}
                  </article>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start" role="status" aria-label="AI Copilot is thinking">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--erp-surface-soft)] px-4 py-3">
                    <LoaderCircle className="h-4 w-4 animate-spin text-[var(--erp-brand)]" aria-hidden="true" />
                    <span className="text-xs text-slate-500">Thinking…</span>
                  </div>
                </div>
              )}
              {error && (
                <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3 text-xs leading-5 text-slate-600" role="alert">
                  {error}
                </p>
              )}
              <div ref={messageEndRef} />
            </div>

            <div className="shrink-0 border-t border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
              {messages.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested questions">
                  {[
                    "Summarize this module",
                    "What can I do here?",
                    "Explain this screen",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSending}
                      onClick={() => void sendMessage(suggestion)}
                      className="min-h-8 rounded-full px-2.5 py-1 text-[10px]"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <div className="min-w-0 flex-1">
                  <Input
                    ref={inputRef}
                    type="text"
                    aria-label="Message AI Copilot"
                    placeholder="Ask a question…"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={isSending}
                    autoComplete="off"
                    maxLength={2000}
                    className="min-h-10 rounded-xl"
                  />
                </div>
                <Button
                  type="submit"
                  aria-label="Send message"
                  title="Send message"
                  disabled={!input.trim() || isSending}
                  className="h-10 w-10 shrink-0 rounded-xl p-0"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
              <p className="mt-2 text-center text-[10px] text-slate-400">
                AI responses may need verification before you act.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
