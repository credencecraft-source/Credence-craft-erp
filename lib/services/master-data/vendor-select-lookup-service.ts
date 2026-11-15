import { prisma } from "@/lib/database/prisma-client";

const MAX_VENDOR_LOOKUP_LIMIT = 200;

export async function listVendorSelectOptionsForOrganization(
  organizationId: string,
  options: { limit: number; includeInactive: boolean },
) {
  const limit = Math.min(Math.max(Math.trunc(options.limit), 1), MAX_VENDOR_LOOKUP_LIMIT);
  const vendors = await prisma.masterVendor.findMany({
    where: {
      organization_id: organizationId,
      ...(options.includeInactive ? {} : { is_active: true }),
    },
    select: { id: true, vendor: true },
    orderBy: [{ sort_order: "asc" }, { vendor: "asc" }],
    take: limit,
  });

  return vendors.map((vendor) => ({ id: vendor.id, label: vendor.vendor }));
}
