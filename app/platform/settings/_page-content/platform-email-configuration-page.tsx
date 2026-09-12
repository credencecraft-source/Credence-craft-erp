import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import {
  getPlatformEmailConfiguration,
  savePlatformEmailConfiguration,
  sendTestEmail,
} from "@/lib/services/platform/platform-email-configuration-service";

export default async function PlatformEmailConfigurationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  await requirePlatformSessionAdmin();
  const configuration = await getPlatformEmailConfiguration();
  const params = (await searchParams) ?? {};

  async function saveEmailConfiguration(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await savePlatformEmailConfiguration({
        smtpHost: String(formData.get("smtpHost") || ""),
        smtpPort: Number(formData.get("smtpPort") || 587),
        smtpSecure: formData.get("smtpSecure") === "on",
        smtpUsername: String(formData.get("smtpUsername") || ""),
        smtpPassword: String(formData.get("smtpPassword") || ""),
        fromEmail: String(formData.get("fromEmail") || ""),
        fromName: String(formData.get("fromName") || ""),
        isActive: formData.get("isActive") === "on",
      });
    } catch (error) {
      redirect(`/platform/settings/email?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save email settings.")}`);
    }
    redirect("/platform/settings/email?success=Email configuration saved.");
  }

  async function sendTestEmailAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      const recipient = String(formData.get("recipient") || "").trim();
      if (!recipient) throw new Error("Enter a test recipient email address.");
      await sendTestEmail(recipient);
    } catch (error) {
      redirect(`/platform/settings/email?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to send test email.")}`);
    }
    redirect("/platform/settings/email?success=Test email sent successfully.");
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">Email and OTP delivery</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Configure the SMTP account used for login and registration verification codes. Passwords are encrypted and never displayed after saving.</p>
        </div>

        {params.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">{params.error}</p>}
        {params.success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">{params.success}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-6">
            <form action={saveEmailConfiguration} className="space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-sm font-bold text-slate-900">SMTP connection</h2>
                <p className="mt-1 text-xs text-slate-500">Use the SMTP details supplied by your mail provider.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Input label="SMTP host" name="smtpHost" required defaultValue={configuration?.smtpHost || ""} placeholder="smtp.gmail.com" />
                <Input label="SMTP port" name="smtpPort" required type="number" min={1} max={65535} defaultValue={String(configuration?.smtpPort || 587)} />
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
                <input type="checkbox" name="smtpSecure" defaultChecked={configuration?.smtpSecure || false} className="h-4 w-4 accent-emerald-600" />
                Use secure TLS connection
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="SMTP username" name="smtpUsername" required defaultValue={configuration?.smtpUsername || ""} placeholder="mailer@company.com" />
                <Input label={configuration?.hasPassword ? "SMTP password (leave blank to keep current)" : "SMTP password"} name="smtpPassword" type="password" required={!configuration?.hasPassword} placeholder={configuration?.hasPassword ? "Saved securely" : "SMTP password"} />
              </div>

              <div className="border-b border-t border-slate-100 py-4">
                <h2 className="text-sm font-bold text-slate-900">Sender identity</h2>
                <p className="mt-1 text-xs text-slate-500">This identity appears on OTP and test emails.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="From email" name="fromEmail" required type="email" defaultValue={configuration?.fromEmail || ""} placeholder="no-reply@company.com" />
                <Input label="From name" name="fromName" required defaultValue={configuration?.fromName || "Credence Craft"} placeholder="Credence Craft" />
              </div>
              <label className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                <input type="checkbox" name="isActive" defaultChecked={configuration?.isActive ?? true} className="h-4 w-4 accent-emerald-600" />
                Enable email delivery for authentication
              </label>

              <div className="flex justify-end border-t border-slate-100 pt-5">
                <Button type="submit">Save email configuration</Button>
              </div>
            </form>
          </Card>

          <div className="space-y-6">
            <Card className="border-emerald-200 bg-emerald-50/60 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Authentication status</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{configuration?.isActive ? "Email OTP enabled" : "Email OTP disabled"}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">Users must receive and verify a real six-digit email code. The development 1234 bypass is not used.</p>
            </Card>

            <Card className="p-6">
              <h2 className="text-sm font-bold text-slate-900">Send test email</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Save the configuration first, then send a test message to confirm the SMTP connection.</p>
              <form action={sendTestEmailAction} className="mt-4 space-y-3">
                <Input label="Recipient email" name="recipient" required type="email" placeholder="you@company.com" />
                <Button type="submit" variant="secondary" className="w-full">Send test email</Button>
              </form>
            </Card>
          </div>
        </div>
      </Section>
    </Page>
  );
}
