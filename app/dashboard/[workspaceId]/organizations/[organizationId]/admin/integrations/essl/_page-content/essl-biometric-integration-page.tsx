import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Fingerprint } from "lucide-react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getEsslIntegrationData,
  saveEsslIntegrationConfiguration,
  saveEsslMachine,
  saveEsslTemplate,
} from "@/lib/services/organizations/essl-biometric-integration-service";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

function routePath(workspaceId: string, organizationId: string) {
  return `/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/essl`;
}

function readField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithMessage(
  path: string,
  kind: "error" | "success",
  message: string,
  tab = "receiver",
): never {
  redirect(`${path}?tab=${tab}&${kind}=${encodeURIComponent(message)}`);
}

export default async function EsslBiometricIntegrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const query = await searchParams;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  const data = await getEsslIntegrationData(user.id, organizationId);
  const path = routePath(workspaceId, organizationId);
  const entityOptions = [
    { value: "", label: "Select entity..." },
    ...data.entities.map((entity) => ({
      value: entity.id,
      label: entity.entity_name,
    })),
  ];
  const activeMachines = data.machines.filter((machine) => machine.isActive);
  const tabs = [
    { id: "receiver", label: "ESSL push receiver" },
    { id: "machines", label: "Biometric machines" },
    { id: "templates", label: "Machine templates" },
    { id: "attendance", label: "Received attendance pushes" },
  ] as const;
  const activeTab = tabs.find((tab) => tab.id === query.tab)?.id ?? "receiver";
  const phpForwardingSnippet = `// Add inside your existing POST block after $rawData is read and logged.
$erpReceiverUrl = 'https://YOUR-ERP-DOMAIN${"/api/integrations/essl/attendance"}';
$erpReceiverToken = '${data.configuration.receiverToken || "Save ESSL settings to generate a receiver token."}';
$erpRequest = curl_init($erpReceiverUrl);
curl_setopt_array($erpRequest, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $rawData,
    CURLOPT_HTTPHEADER => [
        'Content-Type: text/plain',
        'Authorization: Bearer ' . $erpReceiverToken,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 10,
]);
$erpResponse = curl_exec($erpRequest);
$erpStatus = curl_getinfo($erpRequest, CURLINFO_HTTP_CODE);
curl_close($erpRequest);
if ($erpResponse === false || $erpStatus < 200 || $erpStatus >= 300) {
    http_response_code(502);
    echo "ERP forwarding failed";
    exit;
}`;

  async function saveConfigurationAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    try {
      await saveEsslIntegrationConfiguration({
        workspaceUserId: actionUser.id,
        publicOrganizationId: organizationId,
        attendanceApiUrl: readField(formData, "attendanceApiUrl"),
        isActive: formData.get("isActive") === "on",
      });
    } catch (error) {
      redirectWithMessage(
        path,
        "error",
        error instanceof Error ? error.message : "Unable to save ESSL configuration.",
      );
    }
    revalidatePath(path);
    redirectWithMessage(path, "success", "ESSL configuration saved.");
  }

  async function saveMachineAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    try {
      await saveEsslMachine({
        workspaceUserId: actionUser.id,
        publicOrganizationId: organizationId,
        machineId: readField(formData, "machineId") || undefined,
        serialNumber: readField(formData, "serialNumber"),
        entityId: readField(formData, "entityId"),
        location: readField(formData, "location"),
      });
    } catch (error) {
      redirectWithMessage(
        path,
        "error",
        error instanceof Error ? error.message : "Unable to save biometric machine.",
        "machines",
      );
    }
    revalidatePath(path);
    redirectWithMessage(path, "success", "Biometric machine saved.", "machines");
  }

  async function saveTemplateAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    try {
      await saveEsslTemplate({
        workspaceUserId: actionUser.id,
        publicOrganizationId: organizationId,
        templateId: readField(formData, "templateId") || undefined,
        name: readField(formData, "templateName"),
        entityId: readField(formData, "templateEntityId"),
        machineIds: formData.getAll("machineIds").map((value) => String(value)),
      });
    } catch (error) {
      redirectWithMessage(
        path,
        "error",
        error instanceof Error ? error.message : "Unable to save biometric template.",
        "templates",
      );
    }
    revalidatePath(path);
    redirectWithMessage(path, "success", "Biometric template saved.", "templates");
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">
              <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations`} className="hover:text-[var(--erp-brand)]">
                Integrations
              </Link>
              {" / ESSL"}
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Fingerprint className="h-6 w-6 text-[var(--erp-brand)]" aria-hidden="true" />
              ESSL Biometric Attendance
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Configure {data.organizationName}&apos;s machine serial mappings and import punches from its existing PHP attendance API.
            </p>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations`}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Back to Integrations
          </Link>
        </div>

        {query.error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {query.error}
          </p>
        )}
        {query.success && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {query.success}
          </p>
        )}

        <nav aria-label="ESSL integration sections" className="flex min-w-0 flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner shadow-slate-900/[0.02]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={`${path}?tab=${tab.id}`}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "min-h-10 shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200 ease-out",
                  isActive
                    ? "border border-white bg-white text-[var(--erp-brand)] shadow-sm ring-1 ring-slate-900/[0.04]"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {activeTab === "receiver" && (
          <Card id="receiver" className="p-6">
            <form action={saveConfigurationAction} className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">ESSL push receiver</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Your device keeps its current URL and sends its handshake and attendance POSTs to your PHP server. Forward each received POST body from PHP to the authenticated ERP endpoint below.
                </p>
              </div>
              <Input
                label="Attendance API URL"
                name="attendanceApiUrl"
                type="url"
                placeholder="https://attendance.echovaclinic.com/attendance-api.php"
                defaultValue={data.configuration.attendanceApiUrl}
              />
              <Checkbox
                label="Enable ESSL attendance receiver"
                name="isActive"
                defaultChecked={data.configuration.isActive}
              />
              <div className="space-y-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">ERP receiver endpoint</p>
                <code className="block break-all text-sm text-slate-800">
                  https://YOUR-ERP-DOMAIN{"/api/integrations/essl/attendance"}
                </code>
                <p className="text-xs text-slate-600">
                  Keep this token private. Add it as the Authorization bearer header in your PHP server; it is shown only to organization users who can manage master data.
                </p>
                {data.configuration.receiverToken ? (
                  <Input
                    label="Receiver token"
                    type="password"
                    readOnly
                    autoComplete="off"
                    value={data.configuration.receiverToken}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-600">Save the settings to generate a receiver token.</p>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">PHP forwarding block</p>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--erp-border)] bg-white p-3 text-xs leading-5 text-slate-800">
                    <code>{phpForwardingSnippet}</code>
                  </pre>
                </div>
                <p className="text-xs leading-5 text-slate-600">
                  Replace YOUR-ERP-DOMAIN with your deployed ERP host. Keep your existing GET handshake response unchanged; forward POST bodies only. Use HTTPS.
                </p>
              </div>
              <div className="flex justify-end border-t border-[var(--erp-border)] pt-4">
                <Button type="submit">Save ESSL settings</Button>
              </div>
            </form>
          </Card>
        )}

        {activeTab === "machines" && (
          <Card id="machines" className="space-y-5 p-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Biometric machines</h2>
              <p className="mt-1 text-sm text-slate-600">Register each ESSL machine by its serial number and map it to an entity and location.</p>
            </div>
            <form action={saveMachineAction} className="space-y-4">
              <Input label="Machine serial number" name="serialNumber" required maxLength={100} placeholder="ESSL serial number" />
              <Select label="Entity" name="entityId" required options={entityOptions} />
              <Input label="Location" name="location" maxLength={255} placeholder="Factory / floor / site" />
              <div className="flex justify-end">
                <Button type="submit" disabled={data.entities.length === 0}>Add machine</Button>
              </div>
              {data.entities.length === 0 && (
                <p className="text-sm text-slate-600">Create an Entity in organization masters before adding a machine.</p>
              )}
            </form>
            <div className="space-y-3 border-t border-[var(--erp-border)] pt-4">
              <h3 className="text-sm font-semibold text-slate-800">Registered machines</h3>
              {data.machines.length === 0 ? (
                <p className="text-sm text-slate-500">No biometric machines are configured.</p>
              ) : (
                <ul className="space-y-2">
                  {data.machines.map((machine) => (
                    <li key={machine.id} className="rounded-lg border border-[var(--erp-border)] p-3">
                      <form action={saveMachineAction} className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <input type="hidden" name="machineId" value={machine.id} />
                        <Input label="Machine serial number" name="serialNumber" required maxLength={100} defaultValue={machine.serialNumber} />
                        <Select label="Entity" name="entityId" required options={entityOptions} defaultValue={machine.entityId} />
                        <Input label="Location" name="location" maxLength={255} defaultValue={machine.location} />
                        <div className="flex items-end justify-end gap-3">
                          <span className="mr-auto text-xs text-slate-500">{machine.isActive ? "Active" : "Inactive"}</span>
                          <Button type="submit" size="sm" disabled={data.entities.length === 0}>Update mapping</Button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        {activeTab === "templates" && (
          <Card id="templates" className="space-y-5 p-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Machine templates</h2>
              <p className="mt-1 text-sm text-slate-600">Group machines for an entity, matching your Creator template setup.</p>
            </div>
            <form action={saveTemplateAction} className="space-y-4">
              <Input label="Template name" name="templateName" required maxLength={255} placeholder="Factory attendance" />
              <Select label="Entity" name="templateEntityId" required options={entityOptions} />
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600">Biometric machines</legend>
                {activeMachines.length === 0 ? (
                  <p className="text-sm text-slate-500">Add an active machine before creating a template.</p>
                ) : (
                  <div className="space-y-2">
                    {activeMachines.map((machine) => (
                      <Checkbox
                        key={machine.id}
                        name="machineIds"
                        value={machine.id}
                        label={`${machine.serialNumber} ? ${machine.entityName}`}
                      />
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="flex justify-end">
                <Button type="submit" disabled={activeMachines.length === 0 || data.entities.length === 0}>Save template</Button>
              </div>
            </form>
            <div className="space-y-2 border-t border-[var(--erp-border)] pt-4">
              <h3 className="text-sm font-semibold text-slate-800">Configured templates</h3>
              {data.templates.length === 0 ? (
                <p className="text-sm text-slate-500">No templates are configured.</p>
              ) : (
                <ul className="space-y-2">
                  {data.templates.map((template) => (
                    <li key={template.id} className="rounded-lg border border-[var(--erp-border)] p-3">
                      <form action={saveTemplateAction} className="space-y-3">
                        <input type="hidden" name="templateId" value={template.id} />
                        <Input label="Template name" name="templateName" required maxLength={255} defaultValue={template.name} />
                        <Select label="Entity" name="templateEntityId" required options={entityOptions} defaultValue={template.entityId} />
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Machines</p>
                          {activeMachines.map((machine) => (
                            <Checkbox
                              key={machine.id}
                              name="machineIds"
                              value={machine.id}
                              defaultChecked={template.machineIds.includes(machine.id)}
                              label={`${machine.serialNumber} ? ${machine.entityName}`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <Button type="submit" size="sm" disabled={activeMachines.length === 0 || data.entities.length === 0}>Update template</Button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        {activeTab === "attendance" && (
          <Card id="attendance" className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Received attendance pushes</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Raw device payloads forwarded by your PHP receiver. Existing writes to log.txt continue.
                </p>
              </div>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <thead className="bg-[var(--erp-surface-soft)] text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Received at</th>
                    <th className="px-4 py-3">Device payload preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)] text-sm">
                  {data.attendanceLogs.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-500">
                        No attendance pushes received yet. Configure your PHP server to forward POST bodies to the ERP receiver.
                      </td>
                    </tr>
                  ) : data.attendanceLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{log.receivedAt}</td>
                      <td className="max-w-3xl whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs text-slate-700">{log.payload.slice(0, 500)}{log.payload.length > 500 ? "?" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        )}
      </Section>
    </Page>
  );
}
