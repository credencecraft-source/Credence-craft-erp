import NavigationLoadingOverlay from "@/components/ui/NavigationLoadingOverlay";

export default function OrganizationLoading() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-[var(--erp-surface)]">
      <NavigationLoadingOverlay label="Opening organization workspace" />
    </div>
  );
}
