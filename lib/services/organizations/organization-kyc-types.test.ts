import { describe, expect, it } from "vitest";
import {
  OrganizationKycValidationError,
  parseOrganizationKycFormData,
  readOrganizationKycDetails,
} from "./organization-kyc-types";

function createFormData(entries: Record<string, string | string[]>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      formData.append(name, entry);
    }
  }
  return formData;
}

const completeManufacturingAnswers = {
  businessChannel: "MANUFACTURING",
  businessRole: "BRAND_OWNER",
  ownBrandNames: "Studio A",
  marketCoverage: "DOMESTIC_ONLY",
  businessTypes: "Manufacturing",
  staffCount: "15",
  teamMemberCount: "17",
  topManagementCount: "2",
  factoryCount: "1",
  outletCount: "0",
  businessStartedYear: "2018",
  founderName: "Asha",
  founderDesignation: "Founder",
  softwareUsed: "Tally ERP",
  usesSoftware: "YES",
  financeSoftware: "TALLY",
  hasMerchandisers: "YES",
  hasDedicatedStoreIncharge: "NO",
  hasProductionManager: "YES",
  hasSeparateDispatchAccounts: "NO",
  softwareModules: "None",
  majorChallenges: "Quality control",
  lastYearTurnover: "5000000",
  msmeStatus: "REGISTERED",
  products: "Shirts",
  washingUnit: "NO",
  embroideryUnit: "YES",
  shiftCount: "2",
  monthlyProductionPcs: "2500",
};

const completeAnswersWithoutHiddenLegacyFields = Object.fromEntries(
  Object.entries(completeManufacturingAnswers).filter(([name]) => ![
    "businessTypes",
    "factoryCount",
    "outletCount",
    "washingUnit",
    "embroideryUnit",
    "shiftCount",
    "monthlyProductionPcs",
  ].includes(name)),
);

describe("parseOrganizationKycFormData", () => {
  it("normalizes valid draft values without requiring every submission answer", () => {
    const result = parseOrganizationKycFormData(
      createFormData({
        businessTypes: ["Manufacturing"],
        staffCount: "0",
        factoryArrangement: "NOT_APPLICABLE",
      }),
      false,
    );

    expect(result).toMatchObject({
      businessTypes: ["Manufacturing"],
      staffCount: 0,
      factoryArrangement: "NOT_APPLICABLE",
      businessStartedYear: null,
      majorChallenges: [],
    });
  });

  it("rejects tampered choice values and duplicate selections", () => {
    expect(() =>
      parseOrganizationKycFormData(
        createFormData({ businessTypes: "Unlisted type" }),
        false,
      ),
    ).toThrow(OrganizationKycValidationError);

    expect(() =>
      parseOrganizationKycFormData(
        createFormData({ businessTypes: ["Retail", "Retail"] }),
        false,
      ),
    ).toThrow("duplicate selection");
  });

  it("requires a product selection when submitting the profile", () => {
    const answersWithoutProducts = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "products"),
    );
    const formData = createFormData({
      ...answersWithoutProducts,
      brandModel: "OWN_BRAND",
      ownBrandNames: "Studio A",
      factoryArrangement: "NOT_APPLICABLE",
    });

    expect(() => parseOrganizationKycFormData(formData, true)).toThrow(
      "Select the products your business deals with",
    );
  });

  it("requires a description only when Other is selected as a product", () => {
    const answersWithoutOtherProduct = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "products"),
    );

    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...answersWithoutOtherProduct,
          products: ["Shirts", "Other"],
          marketCoverage: "DOMESTIC_ONLY",
          businessRole: "BRAND_OWNER",
          brandModel: "OWN_BRAND",
          ownBrandNames: "Studio A",
        }),
        true,
      ),
    ).toThrow("Describe the other product");

    const result = parseOrganizationKycFormData(
      createFormData({
        ...completeAnswersWithoutHiddenLegacyFields,
        products: ["Shirts", "Other"],
        otherProduct: "Accessories",
        marketCoverage: "DOMESTIC_ONLY",
        businessRole: "BRAND_OWNER",
        brandModel: "OWN_BRAND",
        ownBrandNames: "Studio A",
      }),
      true,
    );
    expect(result.kycDetails).toMatchObject({
      products: ["Shirts", "Other"],
      otherProduct: "Accessories",
      businessRole: "BRAND_OWNER",
    });
  });

  it("accepts Both as market coverage and requires a business ownership selection", () => {
    const result = parseOrganizationKycFormData(
      createFormData({
        ...completeAnswersWithoutHiddenLegacyFields,
        businessRole: "BRAND_AND_FACTORY_OWNER",
        marketCoverage: "BOTH",
        brandModel: "OWN_BRAND",
        ownBrandNames: "Studio A",
      }),
      true,
    );

    expect(result.kycDetails).toMatchObject({
      businessRole: "BRAND_AND_FACTORY_OWNER",
      marketCoverage: "BOTH",
    });
    const answersWithoutBusinessRole = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "businessRole"),
    );
    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...answersWithoutBusinessRole,
          marketCoverage: "BOTH",
          brandModel: "OWN_BRAND",
          ownBrandNames: "Studio A",
        }),
        true,
      ),
    ).toThrow("Select the business role that best describes your organization.");
  });

  it("accepts a distribution, wholesale, or retail business with customer brands and no factory details", () => {
    const answers = {
      ...completeAnswersWithoutHiddenLegacyFields,
      businessChannel: "WHOLESALE",
      businessRole: "DISTRIBUTION_WHOLESALE_RETAIL",
      whiteLabelBrands: "Customer A",
    };

    const result = parseOrganizationKycFormData(createFormData(answers), true);
    expect(result.kycDetails).toMatchObject({
      businessChannel: "WHOLESALE",
      businessRole: "DISTRIBUTION_WHOLESALE_RETAIL",
      brandModel: null,
      ownBrandNames: null,
      whiteLabelBrands: "Customer A",
    });
    expect(result.businessActivities).toEqual([]);

    expect(() => parseOrganizationKycFormData(createFormData({
      ...answers,
      businessChannel: "MANUFACTURING",
    }), true)).toThrow("Choose distribution, wholesale, or retail for this business role.");

    const withoutCustomerBrands = Object.fromEntries(
      Object.entries(answers).filter(([name]) => name !== "whiteLabelBrands"),
    );
    expect(() => parseOrganizationKycFormData(createFormData(withoutCustomerBrands), true))
      .toThrow("Enter at least one customer brand.");
  });

  it("accepts the expanded brand and manufacturing business-role choices", () => {
    const roleAnswers = [
      { businessRole: "BRAND_OWNER_OUTSOURCED", ownBrandNames: "Studio A", expectedBrandModel: "OWN_BRAND" },
      { businessRole: "WHITE_LABEL_PRODUCER", whiteLabelBrands: "Customer A", whiteLabelWorkTypes: "FOB", expectedBrandModel: "WHITE_LABEL" },
      { businessRole: "BRAND_OWNER", ownBrandNames: "Studio A", expectedBrandModel: "OWN_BRAND" },
      { businessRole: "FACTORY_OWNER", whiteLabelBrands: "Customer A", whiteLabelWorkTypes: "FOB", expectedBrandModel: "WHITE_LABEL" },
      { businessRole: "BRAND_AND_FACTORY_OWNER", ownBrandNames: "Studio A", whiteLabelBrands: "Customer A", whiteLabelWorkTypes: "FOB", expectedBrandModel: "BOTH" },
    ];
    for (const { expectedBrandModel, ...answers } of roleAnswers) {
      const formAnswers = Object.fromEntries(
        Object.entries(answers).filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>;
      const result = parseOrganizationKycFormData(
        createFormData({
          ...completeAnswersWithoutHiddenLegacyFields,
          ...formAnswers,
        }),
        true,
      );

      expect(result.kycDetails.businessRole).toBe(answers.businessRole);
      expect(result.kycDetails.brandModel).toBe(expectedBrandModel);
    }
  });

  it("validates migration software, finance integrations, and team responsibilities", () => {
    const noSoftwareAnswers = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "softwareUsed"),
    );
    const noSoftware = parseOrganizationKycFormData(
      createFormData({
        ...noSoftwareAnswers,
        usesSoftware: "NO",
        financeSoftware: ["ZOHO_BOOKS", "BUSY"],
      }),
      true,
    );
    expect(noSoftware.softwareUsed).toBe("None");
    expect(noSoftware.kycDetails.financeSoftware).toEqual(["ZOHO_BOOKS", "BUSY"]);

    const answersWithoutSoftwareName = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "softwareUsed"),
    );
    expect(() => parseOrganizationKycFormData(
      createFormData({ ...answersWithoutSoftwareName, financeSoftware: "TALLY" }),
      true,
    )).toThrow("Enter the software names you currently use.");

    expect(() => parseOrganizationKycFormData(
      createFormData({
        ...completeAnswersWithoutHiddenLegacyFields,
        financeSoftware: "OTHER",
        financeSoftwareOther: "",
      }),
      true,
    )).toThrow("Enter the name of the other finance software.");

    const answersWithoutDispatchTeam = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "hasSeparateDispatchAccounts"),
    );
    expect(() => parseOrganizationKycFormData(
      createFormData(answersWithoutDispatchTeam),
      true,
    )).toThrow("Answer each team responsibility question.");
  });

  it("accepts a complete white-label submission without hidden business-type answers", () => {
    const result = parseOrganizationKycFormData(
      createFormData({
        ...completeAnswersWithoutHiddenLegacyFields,
        brandModel: "WHITE_LABEL",
        whiteLabelBrands: ["Brand A", "Brand B", "Brand C"],
        whiteLabelWorkTypes: ["FOB", "JOB_WORK"],
      }),
      true,
    );

    expect(result.businessStartedYear).toBe(2018);
    expect(result.factoryArrangement).toBe("NOT_APPLICABLE");
    expect(result.businessTypes).toEqual([]);
    expect(result.businessActivities).toEqual([
      "Manufacture for other brands",
      "Job work",
      "FOB",
    ]);
    expect(result.kycDetails).toMatchObject({
      founderName: "Asha",
      products: ["Shirts"],
      marketCoverage: "DOMESTIC_ONLY",
      whiteLabelBrands: "Brand A\nBrand B\nBrand C",
      whiteLabelFulfilment: null,
      buyerNominatedRawMaterials: null,
      msmeStatus: "REGISTERED",
    });
  });

  it("requires market coverage and persists multiple own-brand values", () => {
    const answersWithoutMarket = Object.fromEntries(
      Object.entries(completeAnswersWithoutHiddenLegacyFields).filter(([name]) => name !== "marketCoverage"),
    );
    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...answersWithoutMarket,
          brandModel: "OWN_BRAND",
          ownBrandNames: ["Studio A", "Studio B"],
          ownBrandChannels: "POS",
        }),
        true,
      ),
    ).toThrow("Choose export or domestic-only markets");

    const result = parseOrganizationKycFormData(
      createFormData({
        ...answersWithoutMarket,
        marketCoverage: "EXPORT",
        brandModel: "OWN_BRAND",
        ownBrandNames: ["Studio A", "Studio B"],
      }),
      true,
    );

    expect(result.kycDetails).toMatchObject({
      marketCoverage: "EXPORT",
      ownBrandNames: "Studio A\nStudio B",
      ownBrandChannels: [],
      whiteLabelBrands: null,
    });
  });

  it("accepts an own-brand submission without channel selections", () => {
    const result = parseOrganizationKycFormData(
      createFormData({
        ...completeAnswersWithoutHiddenLegacyFields,
        marketCoverage: "DOMESTIC_ONLY",
        brandModel: "OWN_BRAND",
        ownBrandNames: ["Studio A", "Studio B"],
      }),
      true,
    );

    expect(result.kycDetails).toMatchObject({
      ownBrandNames: "Studio A\nStudio B",
      ownBrandChannels: [],
    });
  });

  it("limits white-label customer entries to five and requires white-label work type", () => {
    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...completeAnswersWithoutHiddenLegacyFields,
          brandModel: "WHITE_LABEL",
          whiteLabelBrands: ["Brand A", "Brand B", "Brand C", "Brand D", "Brand E", "Brand F"],
          whiteLabelFulfilment: "DISTRIBUTORS",
          buyerNominatedRawMaterials: "BOTH",
        }),
        false,
      ),
    ).toThrow("no more than 5");

    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...completeAnswersWithoutHiddenLegacyFields,
          brandModel: "WHITE_LABEL",
          whiteLabelBrands: "Brand A",
          whiteLabelFulfilment: "DISTRIBUTORS",
          buyerNominatedRawMaterials: "BOTH",
          whiteLabelWorkTypes: [],
        }),
        true,
      ),
    ).toThrow("Select whether your white-label work is FOB");
  });

  it("limits priorities to three and validates dependent brand answers", () => {
    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          majorChallenges: [
            "Finding customers and orders",
            "Production capacity",
            "Raw-material sourcing",
            "Quality control",
          ],
        }),
        false,
      ),
    ).toThrow("no more than three");

    expect(() =>
      parseOrganizationKycFormData(
        createFormData({
          ...completeAnswersWithoutHiddenLegacyFields,
          brandModel: "WHITE_LABEL",
          ownBrandNames: "Brand A",
          whiteLabelBrands: "Brand A",
          whiteLabelFulfilment: "DISTRIBUTORS",
        }),
        true,
      ),
    ).toThrow("Select whether your white-label work is FOB");
  });

  it("accepts distribution and retail submissions without manufacturing-only choices", () => {
    for (const businessChannel of ["DISTRIBUTION", "RETAIL"]) {
      const result = parseOrganizationKycFormData(
        createFormData({
          ...completeAnswersWithoutHiddenLegacyFields,
          businessChannel,
          ownBrandNames: "Brands carried",
        }),
        true,
      );

      expect(result.kycDetails).toMatchObject({
        businessChannel,
        marketCoverage: "DOMESTIC_ONLY",
        brandModel: null,
        ownBrandNames: "Brands carried",
      });
      expect(result.businessActivities).toEqual([]);
    }
  });

  it("safely reads known KYC details from stored JSON only", () => {
    expect(readOrganizationKycDetails({
      founderName: "Asha",
      teamMemberCount: 4,
      products: ["Shirts", "Unlisted"],
      msmeStatus: "INVALID",
    })).toMatchObject({
      founderName: "Asha",
      teamMemberCount: 4,
      products: ["Shirts"],
      msmeStatus: null,
    });
    expect(readOrganizationKycDetails(null).products).toEqual([]);
  });
});
