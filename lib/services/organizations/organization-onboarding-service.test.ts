import { beforeEach, describe, expect, it, vi } from "vitest";

const { createOrganizationMock, fetchGstRegistrationMock } = vi.hoisted(() => ({
  createOrganizationMock: vi.fn(),
  fetchGstRegistrationMock: vi.fn(),
}));

vi.mock("./organization-service", () => ({ createOrganization: createOrganizationMock }));
vi.mock("./gst-verification-service", () => ({ fetchGstRegistration: fetchGstRegistrationMock }));

import { Prisma } from "@prisma/client";
import { createOrganizationFromGst } from "./organization-onboarding-service";

const gstDetails = {
  gstNumber: "27ABCDE1234F1Z5",
  organizationName: "Northwind Apparel",
  tradeName: "Northwind Apparel",
  legalName: "Northwind Private Limited",
  registrationStatus: "Active",
  businessType: "Regular",
  registrationDate: "01/01/2020",
  addressLine1: "4, Northwind House, Market Road",
  addressLine2: "Fort",
  city: "Mumbai",
  state: "Maharashtra",
  country: "India",
  pinCode: "400001",
  registeredAddress: "Unit 4, Market Road, Mumbai, Maharashtra, 400001",
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchGstRegistrationMock.mockResolvedValue(gstDetails);
  createOrganizationMock.mockResolvedValue({ organization_id: "public-org-id" });
});

describe("GST-first organization onboarding", () => {
  it("persists the verified identity and address rather than client-provided values", async () => {
    await expect(createOrganizationFromGst({
      workspaceUserId: "user-id",
      ownerName: "Owner Name",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: "owner@example.com",
      mobileNo: "9876543210",
    })).resolves.toEqual({ organizationId: "public-org-id", gstDetails });

    expect(createOrganizationMock).toHaveBeenCalledWith({
      workspaceUserId: "user-id",
      verifiedWorkspaceEmail: "owner@example.com",
      workspaceUserFullName: "Owner Name",
      organizationName: "Northwind Apparel",
      organizationEmail: "owner@example.com",
      mobileNo: "9876543210",
      gstNumber: gstDetails.gstNumber,
      addressLine1: gstDetails.addressLine1,
      addressLine2: gstDetails.addressLine2,
      city: gstDetails.city,
      state: gstDetails.state,
      country: gstDetails.country,
      pinCode: gstDetails.pinCode,
    });
  });

  it("stores the verified organization email on a new mobile-first workspace account", async () => {
    await createOrganizationFromGst({
      workspaceUserId: "user-id",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: "  Owner@Example.com ",
      mobileNo: "919876543210",
    });

    expect(createOrganizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedWorkspaceEmail: "owner@example.com",
      }),
    );
  });

  it("reports a verified email already linked to another workspace account", async () => {
    createOrganizationMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      }),
    );

    await expect(createOrganizationFromGst({
      workspaceUserId: "user-id",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: "owner@example.com",
      mobileNo: "919876543210",
    })).rejects.toThrow("This email address is already linked to another workspace account.");

    expect(createOrganizationMock).toHaveBeenCalled();
  });

  it("does not create an organization when GST verification fails", async () => {
    fetchGstRegistrationMock.mockRejectedValue(new Error("GST verification failed."));

    await expect(createOrganizationFromGst({
      workspaceUserId: "user-id",
      ownerName: "Owner Name",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: "owner@example.com",
      mobileNo: "9876543210",
    })).rejects.toThrow("GST verification failed.");
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it("requires contact details before calling the GST provider", async () => {
    await expect(createOrganizationFromGst({
      workspaceUserId: "user-id",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: " ",
      mobileNo: "",
    })).rejects.toThrow("Email is required.");

    expect(fetchGstRegistrationMock).not.toHaveBeenCalled();
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it("rejects invalid email addresses before creating an organization", async () => {
    await expect(createOrganizationFromGst({
      workspaceUserId: "user-id",
      gstNumber: gstDetails.gstNumber,
      organizationEmail: "invalid-email",
      mobileNo: "919876543210",
    })).rejects.toThrow("Organization email must be valid.");

    expect(fetchGstRegistrationMock).not.toHaveBeenCalled();
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });
});