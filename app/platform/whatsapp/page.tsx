import { redirect } from "next/navigation";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  getPlatformWhatsAppSettings,
  listPlatformWhatsAppTemplates,
} from "@/lib/services/platform/platform-whatsapp-service";
import PlatformWhatsAppPage from "./_page-content/platform-whatsapp-page";

export default async function PlatformWhatsAppRoute() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role === "CTO") redirect("/platform/organisations");

  const [settings, templates] = await Promise.all([
    getPlatformWhatsAppSettings(),
    listPlatformWhatsAppTemplates(),
  ]);
  return (
    <PlatformWhatsAppPage
      initialSettings={{
        ...settings,
        updatedAt: settings.updatedAt?.toISOString() ?? null,
      }}
      initialTemplates={templates.map((template) => ({
        id: template.id,
        templateName: template.template_name,
        sampleTemplateText: template.sample_template_text,
        integratedNumber: template.integrated_number,
        imageUrl: template.image_url ?? "",
        languageCode: template.language_code,
        isActive: template.is_active,
      }))}
    />
  );
}
