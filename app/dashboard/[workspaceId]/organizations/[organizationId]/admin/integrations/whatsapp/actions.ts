"use server";

import { revalidatePath } from "next/cache";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  saveOrganizationWhatsAppSettings,
  saveOrganizationWhatsAppTemplate,
  setOrganizationWhatsAppTemplateActive,
  type OrganizationWhatsAppTemplateInput,
} from "@/lib/services/organizations/whatsapp-integration-service";

function integrationPath(workspaceId: string, organizationId: string) {
  return `/dashboard/${workspaceId}/organizations/${organizationId}/admin/integrations/whatsapp/msg91`;
}

async function authorizeWorkspace(workspaceId: string) {
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) {
    throw new Error("Workspace access denied.");
  }
  return user;
}

export async function saveOrganizationMsg91Settings(input: {
  workspaceId: string;
  organizationId: string;
  apiKey: string;
  namespace: string;
  isActive: boolean;
}) {
  const user = await authorizeWorkspace(input.workspaceId);
  const settings = await saveOrganizationWhatsAppSettings({
    workspaceUserId: user.id,
    publicOrganizationId: input.organizationId,
    apiKey: input.apiKey,
    namespace: input.namespace,
    isActive: input.isActive,
  });
  revalidatePath(integrationPath(input.workspaceId, input.organizationId));
  revalidatePath(`/dashboard/${input.workspaceId}/organizations/${input.organizationId}/admin/integrations/whatsapp`);
  revalidatePath(`/dashboard/${input.workspaceId}/organizations/${input.organizationId}/admin/integrations`);
  return settings;
}

export async function saveOrganizationMsg91Template(input: {
  workspaceId: string;
  organizationId: string;
  templateId?: string;
  template: OrganizationWhatsAppTemplateInput;
}) {
  const user = await authorizeWorkspace(input.workspaceId);
  const template = await saveOrganizationWhatsAppTemplate({
    workspaceUserId: user.id,
    publicOrganizationId: input.organizationId,
    templateId: input.templateId,
    template: input.template,
  });
  revalidatePath(integrationPath(input.workspaceId, input.organizationId));
  return template;
}

export async function setOrganizationMsg91TemplateActive(input: {
  workspaceId: string;
  organizationId: string;
  templateId: string;
  isActive: boolean;
}) {
  const user = await authorizeWorkspace(input.workspaceId);
  const result = await setOrganizationWhatsAppTemplateActive({
    workspaceUserId: user.id,
    publicOrganizationId: input.organizationId,
    templateId: input.templateId,
    isActive: input.isActive,
  });
  revalidatePath(integrationPath(input.workspaceId, input.organizationId));
  return result;
}
