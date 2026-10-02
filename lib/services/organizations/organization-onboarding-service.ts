import { createOrganization } from "./organization-service";
import { fetchGstRegistration } from "./gst-verification-service";

export type CreateOrganizationFromGstInput = {
  workspaceUserId: string;
  gstNumber: string;
  organizationEmail: string;
  mobileNo: string;
};

export async function createOrganizationFromGst(input: CreateOrganizationFromGstInput) {
  const organizationEmail = input.organizationEmail.trim();
  const mobileNo = input.mobileNo.trim();
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

  return { organizationId: organization.organization_id, gstDetails };
}