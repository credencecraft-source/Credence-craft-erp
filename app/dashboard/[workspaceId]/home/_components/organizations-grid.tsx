"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Archive, RotateCcw, Settings, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import NavigationLoadingOverlay from "@/components/ui/NavigationLoadingOverlay";

type WorkspaceOrganization = {
  id: string;
  organization_id: string;
  organization_name: string;
  gst_number: string;
  approval_status: string;
  is_active: boolean;
  membership_role: string;
  membership_role_label: string;
  can_manage_settings: boolean;
};

export function OrganizationsGrid({
  organizations,
  workspaceId,
  initialCursor = null,
  archiveOrgAction,
  restoreOrgAction,
}: {
  organizations: WorkspaceOrganization[];
  workspaceId: string;
  initialCursor?: string | null;
  archiveOrgAction: (formData: FormData) => Promise<void>;
  restoreOrgAction: (formData: FormData) => Promise<void>;
}) {
  const [archiveModalOrg, setArchiveModalOrg] = useState<WorkspaceOrganization | null>(null);
  const [pendingApprovalOrg, setPendingApprovalOrg] = useState<WorkspaceOrganization | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const [directoryOrganizations, setDirectoryOrganizations] = useState(organizations);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [openingOrganizationId, setOpeningOrganizationId] = useState<string | null>(null);

  async function loadMoreOrganizations() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/workspace/organizations?cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load more organizations. Please try again.");
      const page = await response.json();
      setDirectoryOrganizations((current) => [...current, ...(page.organizations || [])]);
      setNextCursor(page.nextCursor ?? null);
    } catch {
      setLoadError("Unable to load more organizations. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      {openingOrganizationId && <NavigationLoadingOverlay />}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {directoryOrganizations.map((organization) => {
          const role = String(organization.membership_role ?? "VIEWER").toUpperCase();
          const canManageOrganization = organization.can_manage_settings;
          const isArchived = organization.approval_status === "ARCHIVED";
          const isOperational = organization.is_active && organization.approval_status === "APPROVED";
          const isPendingApproval = organization.is_active && organization.approval_status === "PENDING_APPROVAL";
          const canOpenOrganization = isOperational || isPendingApproval;
          const approvalLabel = isArchived
            ? "Archived"
            : isOperational
              ? "Active"
              : organization.approval_status === "APPROVED"
                ? "Inactive"
              : organization.approval_status === "REJECTED"
                ? "Rejected"
                : "Pending approval";

          return (
          <div key={organization.id} className="group relative flex flex-col justify-between rounded-lg border border-slate-200/80 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm">
            {isOperational && (
              <Link
                href={`/dashboard/${workspaceId}/organizations/${organization.organization_id}/order-management/merchandising/order`}
                aria-label={`Open ${organization.organization_name}`}
                onClick={(event) => {
                  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    setOpeningOrganizationId(organization.organization_id);
                  }
                }}
                className="absolute inset-0 z-0 rounded-lg"
              />
            )}
            {isPendingApproval && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                aria-label={`View approval status for ${organization.organization_name}`}
                onClick={() => setPendingApprovalOrg(organization)}
                className="absolute inset-0 z-0 h-auto min-h-0 w-auto rounded-lg border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
              >
                <span className="sr-only">View approval status</span>
              </Button>
            )}
            <div className="relative z-10 pointer-events-none">
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 font-bold text-xs shadow-2xs">
                  {organization.organization_name ? organization.organization_name.charAt(0).toUpperCase() : "O"}
                </div>
                
                <div className="relative z-20 flex items-center gap-1.5 pointer-events-auto">
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${isArchived ? "bg-slate-100 text-slate-600" : organization.approval_status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : organization.approval_status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                    {approvalLabel}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${role === "OWNER" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {organization.membership_role_label}
                  </span>
                  {role === "OWNER" && !isArchived && (
                    <Button
                      type="button"
                      onClick={() => {
                        setArchiveModalOrg(organization);
                        setConfirmInput("");
                      }}
                      title="Archive organization"
                      aria-label={`Archive ${organization.organization_name}`}
                      variant="ghost"
                      size="sm"
                      className="h-6 min-h-0 w-6 px-0 py-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  {canManageOrganization && isOperational && (
                    <Link
                      href={`/dashboard/${workspaceId}/organizations/${organization.organization_id}/settings`}
                      aria-label="Organization Settings"
                      title="Organization Settings"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                    >
                      <Settings className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>

              <h3 className="mt-2.5 text-sm font-semibold text-slate-900 tracking-tight truncate" title={organization.organization_name}>
                {organization.organization_name}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono truncate">
                GST: {organization.gst_number || "N/A"}
              </p>
            </div>

            <div className={`relative z-10 mt-3 pt-2 border-t border-slate-100 flex items-center justify-between ${canOpenOrganization ? "pointer-events-none" : "pointer-events-auto"}`}>
              {isOperational ? (
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 w-full justify-between">
                  <span>Open Workspace</span>
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              ) : isPendingApproval ? (
                <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 w-full justify-between">
                  <span>View approval status</span>
                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              ) : isArchived && role === "OWNER" ? (
                <form action={restoreOrgAction} className="w-full">
                  <input type="hidden" name="orgId" value={organization.id} />
                  <RestoreSubmitButton />
                </form>
              ) : (
                <span className="text-[11px] font-medium text-slate-400">Workspace unavailable</span>
              )}
            </div>
          </div>
          );
        })}
      </div>
      {loadError && <p className="mt-3 text-sm text-rose-700" role="alert">{loadError}</p>}
      {nextCursor && (
        <div className="flex justify-center pt-4">
          <Button type="button" variant="secondary" onClick={() => void loadMoreOrganizations()} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more organizations"}
          </Button>
        </div>
      )}

      <Modal
        open={pendingApprovalOrg !== null}
        onClose={() => setPendingApprovalOrg(null)}
        ariaLabelledBy="pending-organization-approval-title"
        ariaDescribedBy="pending-organization-approval-description"
        variant="info"
        size="sm"
      >
        {pendingApprovalOrg && (
          <div className="space-y-4 p-6">
            <div>
              <h2 id="pending-organization-approval-title" className="text-lg font-bold text-slate-900">
                Waiting for organization approval
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-700">{pendingApprovalOrg.organization_name}</p>
            </div>
            <p id="pending-organization-approval-description" className="text-sm leading-6 text-slate-600">
              This organization is under review.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setPendingApprovalOrg(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={archiveModalOrg !== null}
        onClose={() => setArchiveModalOrg(null)}
        ariaLabelledBy="archive-organization-title"
        ariaDescribedBy="archive-organization-description"
        initialFocusRef={dialogTitleRef}
        variant="danger"
        size="md"
      >
        {archiveModalOrg && (
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 shrink-0">
                <TriangleAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 ref={dialogTitleRef} id="archive-organization-title" tabIndex={-1} className="text-base font-bold text-slate-900">Archive this organization?</h3>
                <p className="text-xs text-slate-500 font-medium">{archiveModalOrg.organization_name}</p>
              </div>
            </div>

            <div id="archive-organization-description" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Existing ERP records will be retained and audited. The organization will be unavailable until restored and reapproved.
            </div>

            <form action={archiveOrgAction} className="space-y-4">
              <input type="hidden" name="orgId" value={archiveModalOrg.id} />
              
              <div className="space-y-1.5">
                <label htmlFor="organization-name-confirmation" className="block text-xs font-medium text-slate-700">
                  Type <span className="font-mono font-bold text-rose-700">{archiveModalOrg.organization_name}</span> to confirm:
                </label>
                <Input
                  id="organization-name-confirmation"
                  type="text" 
                  name="confirmationName"
                  required
                  autoComplete="off"
                  placeholder="Enter organization name"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-hidden focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setArchiveModalOrg(null)}
                  variant="secondary"
                  size="sm"
                >
                  Cancel
                </Button>
                <ArchiveSubmitButton disabled={confirmInput !== archiveModalOrg.organization_name} />
              </div>
            </form>
          </div>
        )}
      </Modal>
    </>
  );
}

function ArchiveSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      variant="danger"
      size="sm"
    >
      {pending ? "Archiving..." : "Archive organization"}
    </Button>
  );
}

function RestoreSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending} className="h-auto min-h-0 w-full justify-between px-0 py-0 text-[11px] text-emerald-700 hover:text-emerald-800">
      <span>{pending ? "Restoring..." : "Restore organization"}</span>
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );
}