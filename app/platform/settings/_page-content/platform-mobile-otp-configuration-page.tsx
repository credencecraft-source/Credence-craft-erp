import { redirect } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";
import {
  getPlatformAlternativeMobileOtpConfiguration,
  getPlatformMobileOtpConfiguration,
  savePlatformAlternativeMobileOtpConfiguration,
  savePlatformMobileOtpConfiguration,
} from "@/lib/services/platform/platform-mobile-otp-configuration-service";

export default async function PlatformMobileOtpConfigurationPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  await requirePlatformConfigurationAccess();
  const configuration = await getPlatformMobileOtpConfiguration();
  const alternativeConfiguration =
    await getPlatformAlternativeMobileOtpConfiguration();
  const params = (await searchParams) ?? {};

  async function saveMobileOtpConfiguration(formData: FormData) {
    "use server";
    await requirePlatformConfigurationAccess();

    try {
      await savePlatformMobileOtpConfiguration({
        widgetId: String(formData.get("widgetId") || ""),
        tokenAuth: String(formData.get("tokenAuth") || ""),
        authKey: String(formData.get("authKey") || ""),
      });
    } catch (error) {
      const validationMessages = new Set([
        "MSG91 Widget ID is required.",
        "MSG91 Widget ID must be 255 characters or fewer.",
        "MSG91 tokenAuth and server Auth Key are required for initial setup.",
        "MSG91 credentials must be 2500 characters or fewer.",
      ]);
      const message =
        error instanceof Error && validationMessages.has(error.message)
          ? error.message
          : "Unable to save MSG91 settings. Please try again.";
      redirect(
        `/platform/settings/mobile-otp?error=${encodeURIComponent(message)}`,
      );
    }

    redirect("/platform/settings/mobile-otp?success=MSG91 settings saved.");
  }

  async function saveAlternativeMobileOtpConfiguration(formData: FormData) {
    "use server";
    await requirePlatformConfigurationAccess();

    try {
      await savePlatformAlternativeMobileOtpConfiguration({
        apiUrl: String(formData.get("apiUrl") || ""),
        apiKey: String(formData.get("apiKey") || ""),
      });
    } catch (error) {
      const validationMessages = new Set([
        "Alternative mobile API URL is required.",
        "Alternative mobile API URL must be 2048 characters or fewer.",
        "Alternative mobile API URL must be a valid HTTPS URL.",
        "Alternative mobile API key is required for initial setup.",
        "Alternative mobile API key must be 2500 characters or fewer.",
      ]);
      const message =
        error instanceof Error && validationMessages.has(error.message)
          ? error.message
          : "Unable to save alternative mobile API settings. Please try again.";
      redirect(
        `/platform/settings/mobile-otp?error=${encodeURIComponent(message)}`,
      );
    }

    redirect(
      "/platform/settings/mobile-otp?success=Alternative mobile API settings saved.",
    );
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">
            Mobile OTP configuration
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Store the MSG91 OTP Widget credentials used by the platform mobile
            verification integration. Secret values are encrypted and never
            shown after saving.
          </p>
        </div>

        {params.error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700"
          >
            {params.error}
          </p>
        )}
        {params.success && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700"
          >
            {params.success}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-6">
            <form action={saveMobileOtpConfiguration} className="space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-sm font-bold text-slate-900">
                  MSG91 OTP Widget
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Find the Widget ID and tokenAuth in the widget integration
                  details, and the Auth Key in the server-side integration
                  section.
                </p>
              </div>

              <Input
                label="Widget ID"
                name="widgetId"
                required
                defaultValue={configuration?.widgetId || ""}
                placeholder="MSG91 Widget ID"
                autoComplete="off"
              />
              <Input
                label={
                  configuration?.hasTokenAuth
                    ? "tokenAuth (leave blank to keep current)"
                    : "tokenAuth"
                }
                name="tokenAuth"
                type="password"
                required={!configuration?.hasTokenAuth}
                placeholder={
                  configuration?.hasTokenAuth
                    ? "Saved securely"
                    : "MSG91 Widget token"
                }
                autoComplete="new-password"
              />
              <Input
                label={
                  configuration?.hasAuthKey
                    ? "Server Auth Key (leave blank to keep current)"
                    : "Server Auth Key"
                }
                name="authKey"
                type="password"
                required={!configuration?.hasAuthKey}
                placeholder={
                  configuration?.hasAuthKey
                    ? "Saved securely"
                    : "MSG91 server-side Auth Key"
                }
                autoComplete="new-password"
              />

              <div className="flex justify-end border-t border-slate-100 pt-5">
                <Button type="submit">Save mobile OTP settings</Button>
              </div>
            </form>
          </Card>

          <Card className="h-fit border-emerald-200 bg-emerald-50/60 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Configuration status
            </p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {configuration?.hasTokenAuth && configuration.hasAuthKey
                ? "Credentials saved"
                : "Not configured"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Existing accounts can verify a mobile number in workspace
              configuration and then use mobile OTP sign-in. Registration
              remains email-based.
            </p>
          </Card>
        </div>

        <Card className="p-6">
          <form
            action={saveAlternativeMobileOtpConfiguration}
            className="space-y-5"
          >
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-sm font-bold text-slate-900">
                Alternative mobile API
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Save the profile JSON endpoint and API key separately from
                MSG91. The key is encrypted and never shown after saving. This
                configures credentials only; OTP sending and verification are
                not enabled until the provider&apos;s API contract is connected.
              </p>
            </div>

            <Input
              label="Profile JSON API URL"
              name="apiUrl"
              type="url"
              required
              defaultValue={alternativeConfiguration?.apiUrl || ""}
              placeholder="https://api.example.com/user-profile"
              autoComplete="url"
            />
            <Input
              label={
                alternativeConfiguration?.hasApiKey
                  ? "API key (leave blank to keep current)"
                  : "API key"
              }
              name="apiKey"
              type="password"
              required={!alternativeConfiguration?.hasApiKey}
              placeholder={
                alternativeConfiguration?.hasApiKey
                  ? "Saved securely"
                  : "Provider API key"
              }
              autoComplete="new-password"
            />

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <Button type="submit">Save alternative API settings</Button>
            </div>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
