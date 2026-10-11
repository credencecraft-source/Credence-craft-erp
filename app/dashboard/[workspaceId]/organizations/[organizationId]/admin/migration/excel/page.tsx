import OrganizationMasterSetupPage, {
  type OrganizationMasterSetupPageProps,
} from "../direct/_page-content/organization-master-setup-page";

export default async function ExcelMigrationPage({
  params,
  searchParams,
}: Omit<OrganizationMasterSetupPageProps, "mode">) {
  return OrganizationMasterSetupPage({
    params,
    searchParams,
    mode: "excel",
  });
}
