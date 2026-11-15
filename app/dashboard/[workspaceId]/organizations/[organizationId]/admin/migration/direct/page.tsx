import OrganizationMasterSetupPage, {
  type OrganizationMasterSetupPageProps,
} from "./_page-content/organization-master-setup-page";

export default async function DirectMigrationPage({
  params,
  searchParams,
}: Omit<OrganizationMasterSetupPageProps, "mode">) {
  return OrganizationMasterSetupPage({
    params,
    searchParams,
    mode: "direct",
  });
}
