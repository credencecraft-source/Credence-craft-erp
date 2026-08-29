import VendorForm from "../components/VendorForm";
import AppShell from "../components/AppShell";
import { prisma } from "../lib/bootstrap/prisma";

export const dynamic = "force-dynamic";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [entities, states] = await Promise.all([
    prisma.tenant.findMany({
      select: { id: true, name: true, gstRegisteredStateId: true },
      orderBy: { name: "asc" },
    }),
    prisma.gstState.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const vendor = edit ? await prisma.vendor.findUnique({ where: { id: edit }, select: { id: true, tenantId: true, gstNumber: true, vendorName: true, currencyType: true, gstType: true, registeredGstStateId: true, isThisCustomer: true, city: true, addressLine1: true, addressLine2: true, stateProvince: true, postalCode: true, country: true } }) : null;

  const initialData = vendor ? {
    id: vendor.id,
    tenantId: vendor.tenantId,
    gstNumber: vendor.gstNumber ?? "",
    vendorName: vendor.vendorName,
    currencyType: vendor.currencyType,
    gstType: vendor.gstType ?? "",
    registeredGstStateId: vendor.registeredGstStateId ?? "",
    isThisCustomer: vendor.isThisCustomer,
    city: vendor.city ?? "",
    addressLine1: vendor.addressLine1 ?? "",
    addressLine2: vendor.addressLine2 ?? "",
    stateProvince: vendor.stateProvince ?? "",
    postalCode: vendor.postalCode ?? "",
    country: vendor.country ?? "",
  } : undefined;

  return (
    <AppShell>
      <VendorForm entities={entities} states={states} editId={vendor?.id} initialData={initialData} />
    </AppShell>
  );
}
