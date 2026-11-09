import Button from "@/components/ui/Button";
import type { SessionUser } from "@/lib/auth/session-manager";

export default function WorkspaceUserSupportAccessBanner({
  workspaceId,
  supportAccess,
}: {
  workspaceId: string;
  supportAccess: NonNullable<SessionUser["supportAccess"]>;
}) {
  return (
    <aside
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--erp-border)] bg-[var(--erp-brand-soft)] px-4 py-3 text-[var(--erp-text)]"
      role="status"
      aria-label="Read-only platform support access"
    >
      <div className="min-w-0 text-sm">
        <p className="font-semibold">
          Read-only support access · {supportAccess.platformAdminName} (
          {supportAccess.platformAdminEmail})
        </p>
        <p className="text-xs">
          {supportAccess.reason} Expires{" "}
          {supportAccess.expiresAt.toLocaleTimeString()}.
        </p>
      </div>
      <form
        action={`/dashboard/${encodeURIComponent(workspaceId)}/support-access/end`}
        method="post"
      >
        <Button
          type="submit"
          variant="secondary"
          className="text-xs"
        >
          End support access
        </Button>
      </form>
    </aside>
  );
}
