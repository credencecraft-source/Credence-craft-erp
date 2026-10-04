import { prisma } from "@/lib/database/prisma-client";

import { createOrganization } from "./organization-service";
import { fetchGstRegistration } from "./gst-verification-service";

export type CreateOrganizationFromGstInput = {
  workspaceUserId: string;
  ownerName?: string;
  gstNumber: string;
  organizationEmail: string;
  mobileNo: string;
};

export async function createOrganizationFromGst(input: CreateOrganizationFromGstInput) {
  const organizationEmail = input.organizationEmail.trim();
  const mobileNo = input.mobileNo.trim();
  const ownerName = input.ownerName?.trim() || "";
  if (!organizationEmail) throw new Error("Email is required.");
  if (!mobileNo) throw new Error("Mobile number is required.");

  const gstDetails = await fetchGstRegistration(input.gstNumber);
  const organization = await createOrganization({
    workspaceUserId: input.workspaceUserId,
    organizationName: gstDetails.organizationName,
    organizationEmail,
    mobileNo,
    gstNumber: gstDetails.gstNumber,
    addressLine1: gstDetails.addressLine1,
    addressLine2: gstDetails.addressLine2,
    city: gstDetails.city,
    state: gstDetails.state,
    country: gstDetails.country,
    pinCode: gstDetails.pinCode,
  });

  if (ownerName) {
    await prisma.workspaceUser.update({
      where: { id: input.workspaceUserId },
      data: {
        full_name: ownerName,
      },
    });
  }

  return { organizationId: organization.organization_id, gstDetails };
}