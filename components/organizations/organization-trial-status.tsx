"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Send } from "lucide-react";
import Button from "@/components/ui/Button";

type OrganizationTrialStatusProps = {
  organizationId: string;
  trialEnabled: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  onExpiryChange: (expired: boolean) => void;
};

function formatRemainingTime(milliseconds: number) {
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function OrganizationTrialStatus({
  organizationId,
  trialEnabled,
  trialStartedAt,
  trialEndsAt,
  onExpiryChange,
}: OrganizationTrialStatusProps) {
  const router = useRouter();
  const trialEnd = trialEndsAt ? Date.parse(trialEndsAt) : Number.NaN;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [requestState, setRequestState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!trialEnabled || !trialStartedAt || !trialEndsAt || !Number.isFinite(trialEnd)) return;

    let previousRemaining: number | null = null;
    const updateRemaining = () => {
      const nextRemaining = Math.max(0, trialEnd - Date.now());
      setRemainingMs(nextRemaining);
      onExpiryChange(nextRemaining === 0);
      if (nextRemaining === 0 && previousRemaining !== null && previousRemaining > 0) {
        router.refresh();
      }
      previousRemaining = nextRemaining;
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [onExpiryChange, router, trialEnabled, trialEnd, trialEndsAt, trialStartedAt]);

  if (!trialEnabled || !trialStartedAt || !trialEndsAt || !Number.isFinite(trialEnd)) return null;

  const expired = remainingMs === 0;

  async function requestExtension() {
    setRequestState("pending");
    setErrorMessage("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/trial-extension-requests`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to request a trial extension.");
      setRequestState("sent");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to request a trial extension.");
      setRequestState("error");
    }
  }

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold ${
          expired
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
        aria-live="polite"
      >
        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        {expired ? "Trial expired" : remainingMs === null ? "Trial active" : `Trial expires in ${formatRemainingTime(remainingMs)}`}
      </span>

      {expired && requestState !== "sent" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={requestExtension}
          disabled={requestState === "pending"}
          className="h-9 gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {requestState === "pending" ? "Sending..." : "Request extension"}
        </Button>
      )}

      {expired && requestState === "sent" && (
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800" role="status">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Request sent
        </span>
      )}

      {expired && errorMessage && <span className="text-xs text-red-700" role="alert">{errorMessage}</span>}
    </div>
  );
}