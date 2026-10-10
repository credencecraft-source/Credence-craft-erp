"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import { ReportGrid } from "@/components/reports/report-grid-display";

type WorkspaceUserReportRow = {
  id: string;
  full_name: string;
  profile_name: string;
  email: string | null;
  emailVerified: string;
  mobileNumber: string;
  mobileVerification: string;
  lastLogin: string;
  organisations: string;
  organisationCount: number;
  totalRecords: number;
  status: string;
};

const fields = [
  { key: "full_name", label: "Name" },
  { key: "profile_name", label: "Profile" },
  { key: "email", label: "Email" },
  { key: "emailVerified", label: "Email verification" },
  { key: "mobileNumber", label: "Mobile number" },
  { key: "mobileVerification", label: "Mobile verification" },
  { key: "lastLogin", label: "Last login" },
  { key: "organisations", label: "Organisations" },
  { key: "totalRecords", label: "Total records" },
  { key: "status", label: "Status" },
];

const hiddenFieldKeys = new Set([
  "profile_name",
  "emailVerified",
  "organisations",
]);

const defaultVisibleFields = fields
  .filter(({ key }) => !hiddenFieldKeys.has(key))
  .map(({ key }) => key);

const sanitizeVisibleFields = (next: string[]) =>
  next.filter((field) => !hiddenFieldKeys.has(field));

export default function PlatformWorkspaceUsersReport({
  users,
}: {
  users: WorkspaceUserReportRow[];
}) {
  const router = useRouter();
  const [visibleFields, setVisibleFields] = useState<string[]>(
    defaultVisibleFields,
  );
  const changeVisibleFields = useCallback((next: string[]) => {
    setVisibleFields(sanitizeVisibleFields(next));
  }, []);
  const openUser = useCallback(
    (userId: string) => {
      router.push(`/platform/workspace-users/${encodeURIComponent(userId)}`);
    },
    [router],
  );

  return (
    <ReportGrid
      title="Workspace user accounts"
      records={users}
      fields={fields}
      visibleFields={visibleFields}
      onVisibleFieldsChange={changeVisibleFields}
      storageKey="platform-workspace-users-report-columns-v3"
      rowIdSelector={(user) => user.id}
      selectedIds={[]}
      selectable={false}
      onRowClick={openUser}
      onRowAction={openUser}
      rowActionLabel="Open"
      emptyMessage="No workspace users found."
      renderCell={(fieldKey, user) => {
        if (fieldKey === "email") {
          return user.email || <span className="text-slate-400">Not provided</span>;
        }
        if (fieldKey === "emailVerified") {
          return (
            <Badge
              className={
                user.emailVerified === "Verified"
                  ? "bg-emerald-100 text-emerald-800"
                  : user.emailVerified === "Pending"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
              }
            >
              {user.emailVerified}
            </Badge>
          );
        }
        if (fieldKey === "mobileNumber") {
          return user.mobileNumber || (
            <span className="text-slate-400">Not provided</span>
          );
        }
        if (fieldKey === "mobileVerification") {
          return (
            <Badge
              className={
                user.mobileVerification === "Verified"
                  ? "bg-emerald-100 text-emerald-800"
                  : user.mobileVerification === "Pending"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
              }
            >
              {user.mobileVerification}
            </Badge>
          );
        }
        if (fieldKey === "organisations") {
          return (
            <span title={user.organisations}>
              {user.organisationCount}
              {user.organisations ? ` · ${user.organisations}` : ""}
            </span>
          );
        }
        if (fieldKey === "totalRecords") {
          return user.totalRecords.toLocaleString("en-IN");
        }
        if (fieldKey === "status") {
          return (
            <Badge
              className={
                user.status === "Active"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }
            >
              {user.status}
            </Badge>
          );
        }
        return user[fieldKey as keyof WorkspaceUserReportRow] ?? "—";
      }}
    />
  );
}
