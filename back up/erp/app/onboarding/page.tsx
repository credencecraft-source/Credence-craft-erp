import EntityForm from "../components/EntityForm";
import AppShell from "../components/AppShell";
import { prisma } from "../lib/bootstrap/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const entity = edit ? await prisma.tenant.findUnique({ where: { id: edit }, select: { id: true, name: true, gstNumber: true, email: true, phone: true, displayName: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true, country: true } }) : null;

  const initialData = entity ? {
    id: entity.id,
    name: entity.name,
    gstNumber: entity.gstNumber ?? "",
    email: entity.email ?? "",
    phone: entity.phone ?? "",
    displayName: entity.displayName ?? "",
    addressLine1: entity.addressLine1 ?? "",
    addressLine2: entity.addressLine2 ?? "",
    city: entity.city ?? "",
    state: entity.state ?? "",
    postalCode: entity.postalCode ?? "",
    country: entity.country ?? "",
  } : undefined;

  return (
    <AppShell>
      <EntityForm editId={entity?.id} initialData={initialData} />
    </AppShell>
  );
}