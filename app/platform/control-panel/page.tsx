import { redirect } from "next/navigation";
import Link from "next/link";

import {
  getAvailablePlatformViews,
  requirePlatformSessionAdmin,
  setPlatformViewMode,
  type PlatformViewMode,
} from "@/lib/auth/platform-session-manager";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const PLATFORM_VIEWS: Array<{
  value: PlatformViewMode;
  title: string;
  description: string;
}> = [
  {
    value: "SUPER_ADMIN",
    title: "Super Admin",
    description: "Open the Super Admin workspace and its platform menu.",
  },
  {
    value: "ADMIN",
    title: "Admin",
    description: "Open the Admin workspace and its platform menu.",
  },
  {
    value: "CTO",
    title: "CTO",
    description: "Open the CTO workspace and its support menu.",
  },
  {
    value: "CMO",
    title: "CMO",
    description: "Open the CMO workspace and its leads and campaigns menu.",
  },
];

export default async function PlatformControlPanelPage() {
  const admin = await requirePlatformSessionAdmin();
  const availableViews = getAvailablePlatformViews(admin.actualRole, admin.team_role);

  async function openPlatformView(formData: FormData) {
    "use server";

    const selectedViewValue = String(formData.get("view") ?? "");
    const selectedView = availableViews.find((view) => view === selectedViewValue);
    if (!selectedView) {
      throw new Error("You do not have access to that platform workspace.");
    }

    if (admin.actualRole === "SUPER_ADMIN") {
      await setPlatformViewMode(selectedView);
    }

    redirect("/platform/organisations");
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="erp-page-heading">Control Panel</h1>
          <p className="erp-page-subheading">
            Choose an access level to open its workspace and matching sidebar menu.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLATFORM_VIEWS.filter((view) => availableViews.includes(view.value)).map((view) => (
            <form key={view.value} action={openPlatformView}>
              <input type="hidden" name="view" value={view.value} />
              <Button
                type="submit"
                variant="card"
                className="group min-h-44 w-full items-start justify-between p-5 transition hover:border-[var(--erp-brand)] focus-visible:ring-2"
              >
                <span>
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--erp-brand-soft)] text-sm font-bold text-[var(--erp-brand)]">
                    {view.title.charAt(0)}
                  </span>
                  <span className="block text-lg font-semibold text-slate-900">
                    {view.title}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-600">
                    {view.description}
                  </span>
                </span>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)]">
                  Open workspace
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Button>
            </form>
          ))}
        </div>

        <Link href="/platform/organisations">
          <Button variant="ghost" className="erp-btn-secondary-alt">
            Back to platform
          </Button>
        </Link>
      </Section>
    </Page>
  );
}
