import { Prisma } from "@prisma/client";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation-rules";

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
  const organizationEmail = normalizeEmail(input.organizationEmail);
  const mobileNo = input.mobileNo.trim();
  const ownerName = input.ownerName?.trim() || "";
  if (!organizationEmail) throw new Error("Email is required.");
  if (!isValidEmail(organizationEmail)) throw new Error("Organization email must be valid.");
  if (!mobileNo) throw new Error("Mobile number is required.");

  const gstDetails = await fetchGstRegistration(input.gstNumber);

  let organization: Awaited<ReturnType<typeof createOrganization>>;
  try {
    organization = await createOrganization({
      workspaceUserId: input.workspaceUserId,
      verifiedWorkspaceEmail: organizationEmail,
      ...(ownerName ? { workspaceUserFullName: ownerName } : {}),
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
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target;
      const conflictsOnEmail = Array.isArray(target)
        ? target.some((field) => String(field).toLowerCase().includes("email"))
        : typeof target === "string" &&
          target.toLowerCase().includes("email");
      if (conflictsOnEmail) {
        throw new Error("This email address is already linked to another workspace account.");
      }
    }
    throw error;
  }

  return { organizationId: organization.organization_id, gstDetails };
}