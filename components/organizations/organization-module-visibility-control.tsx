"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Factory,
  Gauge,
  Landmark,
  LayoutGrid,
  Lock,
  Package,
  PanelsTopLeft,
  Truck,
} from "lucide-react";
import Button from "@/components/ui/Button";

const Modal = dynamic(() => import("@/components/ui/Modal"), { ssr: false });

type ModuleOption = {
  key: string;
  label: string;
  isVisible: boolean;
};

const moduleIcons = {
  online: Gauge,
  pos: Landmark,
  "order-management": ClipboardList,
  "asset-management": Package,
  "design-development": BriefcaseBusiness,
  "factory-management": Factory,
  "quality-management-system": Boxes,
  "finance-management": Landmark,
  "inventory-management": Package,
  distribution: Truck,
  "security-management": Lock,
  approvals: ClipboardList,
  settings: LayoutGrid,
  admin: LayoutGrid,
} as const;

export default function OrganizationModuleVisibilityControl({
  modules,
  updateVisibility,
}: {
  modules: ModuleOption[];
  updateVisibility: (moduleKey: string, isVisible: boolean) => Promise<{
    changed?: boolean;
    error?: string;
    isVisible?: boolean;
  }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [moduleStates, setModuleStates] = useState(modules);
  const [updatingModuleKey, setUpdatingModuleKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function toggleModule(module: ModuleOption) {
    if (updatingModuleKey) return;
    setUpdatingModuleKey(module.key);
    setError("");
    setNotice("");

    try {
      const result = await updateVisibility(module.key, !module.isVisible);
      if (result.error) {
        setError(result.error);
        return;
      }

      setModuleStates((current) => current.map((item) => (
        item.key === module.key ? { ...item, isVisible: !module.isVisible } : item
      )));
      setNotice(`${module.label} ${module.isVisible ? "hidden from" : "shown in"} the organization workspace.`);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update module visibility.");
    } finally {
      setUpdatingModuleKey(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Manage organization module visibility"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Manage organization module visibility"
        onClick={() => {
          setOpen(true);
          setError("");
          setNotice("");
        }}
        className="h-9 w-9 p-0"
      >
        <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <Modal
          open
          onClose={() => {
            if (!updatingModuleKey) setOpen(false);
          }}
          ariaLabelledBy="organization-module-visibility-title"
          ariaDescribedBy="organization-module-visibility-description"
          size="rectangle"
        >
          <div className="border-b border-[var(--erp-border)] px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--erp-brand)]">Organization workspace</p>
            <h2 id="organization-module-visibility-title" className="mt-1 text-lg font-semibold text-[var(--erp-text)]">
              Visible modules
            </h2>
            <p id="organization-module-visibility-description" className="mt-1 text-sm text-[var(--erp-muted)]">
              Choose which platform-enabled modules appear in the organization module menu. Platform-disabled modules cannot be selected here.
            </p>
          </div>
          <div className="space-y-4 p-6">
            {error ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
            {notice ? <p className="text-sm text-[var(--erp-brand)]" role="status">{notice}</p> : null}
            {moduleStates.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {moduleStates.map((module) => {
                  const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutGrid;
                  const isUpdating = updatingModuleKey === module.key;

                  return (
                    <Button
                      key={module.key}
                      type="button"
                      variant="card"
                      aria-pressed={module.isVisible}
                      aria-label={`${module.isVisible ? "Hide" : "Show"} ${module.label} in organization workspace`}
                      disabled={Boolean(updatingModuleKey)}
                      onClick={() => void toggleModule(module)}
                      className={`min-h-28 w-full gap-4 p-4 ${
                        module.isVisible
                          ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]"
                          : "border-[var(--erp-border)] bg-[var(--erp-surface)]"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface)] p-2 text-[var(--erp-brand)]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        {isUpdating ? (
                          <span className="text-xs text-[var(--erp-muted)]" role="status">Saving…</span>
                        ) : module.isVisible ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--erp-brand)]" aria-label="Visible" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-[var(--erp-muted)]" aria-hidden="true" />
                        )}
                      </span>
                      <span className="text-sm font-semibold">{module.label}</span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4 text-sm text-[var(--erp-muted)]">
                The platform has not enabled any modules for this organization yet.
              </p>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
