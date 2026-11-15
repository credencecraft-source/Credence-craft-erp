export const ORGANIZATION_KYC_BUSINESS_TYPES = [
  "Manufacturing",
  "Distribution",
  "Dealer",
  "Wholesale",
  "Retail",
  "Boutique",
  "Agent / Representative",
  "Other",
] as const;

export const ORGANIZATION_KYC_CHALLENGES = [
  "Finding customers and orders",
  "Production capacity",
  "Raw-material sourcing",
  "Quality control",
  "Workforce and skills",
  "Costing and cash flow",
  "Order and inventory management",
  "Compliance",
  "Other",
] as const;

export const ORGANIZATION_KYC_ACTIVITIES = [
  "Own brands",
  "Manufacture for other brands",
  "Job work",
  "FOB",
] as const;

export const ORGANIZATION_KYC_FACTORY_ARRANGEMENTS = [
  "OWN",
  "OUTSOURCED",
  "BOTH",
  "NOT_APPLICABLE",
] as const;

export const ORGANIZATION_KYC_PRODUCTS = [
  "Shirts",
  "Pants",
  "Menswear",
  "Womenswear",
  "Kidswear",
  "Other",
] as const;

export const ORGANIZATION_KYC_SOFTWARE_MODULES = [
  "Order management",
  "Inventory management",
  "Factory operations",
  "Finance",
  "HR",
  "Spreadsheets only",
  "None",
] as const;

export const ORGANIZATION_KYC_FINANCE_SOFTWARE = [
  "TALLY",
  "ZOHO_BOOKS",
  "BUSY",
  "OTHER",
  "NOT_SURE",
] as const;

export const ORGANIZATION_KYC_BRAND_MODELS = [
  "OWN_BRAND",
  "WHITE_LABEL",
  "BOTH",
  "NEITHER",
] as const;

export const ORGANIZATION_KYC_BUSINESS_CHANNELS = [
  "MANUFACTURING",
  "DISTRIBUTION",
  "WHOLESALE",
  "RETAIL",
] as const;

export const ORGANIZATION_KYC_BUSINESS_ROLES = [
  "BRAND_OWNER_OUTSOURCED",
  "WHITE_LABEL_PRODUCER",
  "BRAND_OWNER",
  "FACTORY_OWNER",
  "BRAND_AND_FACTORY_OWNER",
  "DISTRIBUTION_WHOLESALE_RETAIL",
] as const;

export const ORGANIZATION_KYC_MARKET_COVERAGE = [
  "EXPORT",
  "DOMESTIC_ONLY",
  "BOTH",
] as const;

export const ORGANIZATION_KYC_OWN_BRAND_CHANNELS = [
  "POS",
  "Wholesale",
  "Distribution",
] as const;

export const ORGANIZATION_KYC_WHITE_LABEL_FULFILMENT = [
  "DIRECT_TO_CUSTOMER",
  "DISTRIBUTORS",
  "BOTH",
] as const;

export const ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES = [
  "JOB_WORK",
  "FOB",
] as const;

export const ORGANIZATION_KYC_RAW_MATERIAL_OPTIONS = [
  "YES",
  "NO",
  "BOTH",
] as const;

export const ORGANIZATION_KYC_YES_NO = ["YES", "NO"] as const;

export const ORGANIZATION_KYC_MSME_STATUSES = [
  "REGISTERED",
  "NOT_REGISTERED",
  "APPLIED",
  "NOT_SURE",
] as const;

export type OrganizationKycDetails = {
  founderName: string | null;
  founderDesignation: string | null;
  teamMemberCount: number | null;
  topManagementCount: number | null;
  products: string[];
  otherProduct: string | null;
  businessRole: string | null;
  washingUnit: string | null;
  embroideryUnit: string | null;
  shiftCount: number | null;
  businessChannel: string | null;
  marketCoverage: string | null;
  brandModel: string | null;
  ownBrandNames: string | null;
  ownBrandChannels: string[];
  whiteLabelFulfilment: string | null;
  whiteLabelBrands: string | null;
  whiteLabelWorkTypes: string[];
  buyerNominatedRawMaterials: string | null;
  softwareModules: string[];
  usesSoftware: string | null;
  financeSoftware: string[];
  financeSoftwareOther: string | null;
  hasMerchandisers: string | null;
  hasDedicatedStoreIncharge: string | null;
  hasProductionManager: string | null;
  hasSeparateDispatchAccounts: string | null;
  lastYearTurnover: number | null;
  msmeStatus: string | null;
};

export type OrganizationKycFormData = {
  businessTypes: string[];
  businessTypeOther: string | null;
  staffCount: number | null;
  factoryCount: number | null;
  outletCount: number | null;
  businessStartedYear: number | null;
  softwareUsed: string | null;
  majorChallenges: string[];
  majorChallengeOther: string | null;
  brandsWorkedWith: string | null;
  monthlyProductionPcs: number | null;
  businessActivities: string[];
  factoryArrangement: string | null;
  kycDetails: OrganizationKycDetails;
};

export class OrganizationKycValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationKycValidationError";
  }
}

function readSelectedValues(formData: FormData, field: string, allowed: readonly string[]) {
  const values = formData.getAll(field);
  if (values.some((value) => typeof value !== "string" || !allowed.includes(value))) {
    throw new OrganizationKycValidationError("The KYC form contains an invalid selection.");
  }
  const selected = values as string[];
  if (new Set(selected).size !== selected.length) {
    throw new OrganizationKycValidationError("The KYC form contains a duplicate selection.");
  }
  return selected;
}

function readSingleChoice(formData: FormData, field: string, allowed: readonly string[]) {
  const value = formData.get(field);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new OrganizationKycValidationError("The KYC form contains an invalid selection.");
  }
  return value;
}

function readText(formData: FormData, field: string, maximumLength: number) {
  const value = formData.get(field);
  if (value === null) return null;
  if (typeof value !== "string") throw new OrganizationKycValidationError("The KYC form contains an invalid text value.");
  const cleaned = value.trim();
  if (cleaned.length > maximumLength) throw new OrganizationKycValidationError("One of the KYC answers is too long.");
  return cleaned || null;
}

function readBrandNames(formData: FormData, field: string, maximumNames: number) {
  const rawValues = formData.getAll(field);
  if (rawValues.some((value) => typeof value !== "string")) {
    throw new OrganizationKycValidationError("The KYC form contains an invalid brand name.");
  }

  const values = (rawValues as string[])
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length > maximumNames) {
    throw new OrganizationKycValidationError(`Enter no more than ${maximumNames} brand names.`);
  }
  if (values.join("\n").length > 2000) {
    throw new OrganizationKycValidationError("One of the KYC brand lists is too long.");
  }
  return values.length > 0 ? values.join("\n") : null;
}

function readCount(formData: FormData, field: string, maximum: number) {
  const value = formData.get(field);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new OrganizationKycValidationError("Enter a valid whole number for each KYC count.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new OrganizationKycValidationError("One of the KYC counts is outside the allowed range.");
  }
  return parsed;
}

export function parseOrganizationKycFormData(formData: FormData, submitting: boolean): OrganizationKycFormData {
  const businessTypes = readSelectedValues(formData, "businessTypes", ORGANIZATION_KYC_BUSINESS_TYPES);
  const majorChallenges = readSelectedValues(formData, "majorChallenges", ORGANIZATION_KYC_CHALLENGES);
  const products = readSelectedValues(formData, "products", ORGANIZATION_KYC_PRODUCTS);
  const softwareModules: string[] = [];
  const financeSoftware = readSelectedValues(formData, "financeSoftware", ORGANIZATION_KYC_FINANCE_SOFTWARE);
  const ownBrandChannels: string[] = [];
  const businessTypeOther = readText(formData, "businessTypeOther", 255);
  const staffCount = readCount(formData, "staffCount", 1_000_000);
  const factoryCount = readCount(formData, "factoryCount", 100_000);
  const outletCount = readCount(formData, "outletCount", 100_000);
  const yearText = readText(formData, "businessStartedYear", 4);
  const businessStartedYear = yearText === null ? null : Number(yearText);
  const enteredSoftwareUsed = readText(formData, "softwareUsed", 1000);
  const usesSoftware = readSingleChoice(formData, "usesSoftware", ORGANIZATION_KYC_YES_NO);
  const softwareUsed = usesSoftware === "NO" ? "None" : enteredSoftwareUsed;
  const financeSoftwareOther = readText(formData, "financeSoftwareOther", 255);
  const hasMerchandisers = readSingleChoice(formData, "hasMerchandisers", ORGANIZATION_KYC_YES_NO);
  const hasDedicatedStoreIncharge = readSingleChoice(formData, "hasDedicatedStoreIncharge", ORGANIZATION_KYC_YES_NO);
  const hasProductionManager = readSingleChoice(formData, "hasProductionManager", ORGANIZATION_KYC_YES_NO);
  const hasSeparateDispatchAccounts = readSingleChoice(formData, "hasSeparateDispatchAccounts", ORGANIZATION_KYC_YES_NO);
  const majorChallengeOther = readText(formData, "majorChallengeOther", 1000);
  const otherProduct = readText(formData, "otherProduct", 500);
  const monthlyProductionPcs = readCount(formData, "monthlyProductionPcs", 1_000_000_000);
  const teamMemberCount = readCount(formData, "teamMemberCount", 1_000_000);
  const topManagementCount = readCount(formData, "topManagementCount", 100_000);
  const shiftCount = readCount(formData, "shiftCount", 100);
  const lastYearTurnover = readCount(formData, "lastYearTurnover", 10_000_000_000_000);
  const washingUnit = readSingleChoice(formData, "washingUnit", ORGANIZATION_KYC_YES_NO);
  const embroideryUnit = readSingleChoice(formData, "embroideryUnit", ORGANIZATION_KYC_YES_NO);
  const businessChannel = readSingleChoice(formData, "businessChannel", ORGANIZATION_KYC_BUSINESS_CHANNELS);
  const businessRole = readSingleChoice(formData, "businessRole", ORGANIZATION_KYC_BUSINESS_ROLES);
  const marketCoverage = readSingleChoice(formData, "marketCoverage", ORGANIZATION_KYC_MARKET_COVERAGE);
  const selectedBrandModel = readSingleChoice(formData, "brandModel", ORGANIZATION_KYC_BRAND_MODELS);
  const roleBrandModel = businessRole === "BRAND_OWNER_OUTSOURCED" || businessRole === "BRAND_OWNER"
    ? "OWN_BRAND"
    : businessRole === "WHITE_LABEL_PRODUCER" || businessRole === "FACTORY_OWNER"
      ? "WHITE_LABEL"
      : businessRole === "BRAND_AND_FACTORY_OWNER"
        ? "BOTH"
        : null;
  const brandModel = businessChannel === "MANUFACTURING" ? selectedBrandModel ?? roleBrandModel : null;
  const whiteLabelFulfilment = readSingleChoice(formData, "whiteLabelFulfilment", ORGANIZATION_KYC_WHITE_LABEL_FULFILMENT);
  const whiteLabelWorkTypes = readSelectedValues(formData, "whiteLabelWorkTypes", ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES);
  const buyerNominatedRawMaterials = readSingleChoice(formData, "buyerNominatedRawMaterials", ORGANIZATION_KYC_RAW_MATERIAL_OPTIONS);
  const msmeStatus = readSingleChoice(formData, "msmeStatus", ORGANIZATION_KYC_MSME_STATUSES);
  const founderName = readText(formData, "founderName", 255);
  const founderDesignation = readText(formData, "founderDesignation", 255);
  const ownBrandNames = readBrandNames(formData, "ownBrandNames", 20);
  const whiteLabelBrands = readBrandNames(formData, "whiteLabelBrands", 5);

  if (businessStartedYear !== null && (!Number.isSafeInteger(businessStartedYear) || businessStartedYear < 1800 || businessStartedYear > new Date().getFullYear())) {
    throw new OrganizationKycValidationError("Enter a valid business start year.");
  }

  const hasOwnBrand = businessChannel === "MANUFACTURING"
    && (brandModel === "OWN_BRAND" || brandModel === "BOTH");
  const hasWhiteLabel = businessChannel === "MANUFACTURING"
    && (brandModel === "WHITE_LABEL" || brandModel === "BOTH");
  const isDistributionWholesaleRetail = businessRole === "DISTRIBUTION_WHOLESALE_RETAIL";
  const whiteLabelBrandNames = whiteLabelBrands ?? (brandModel === "WHITE_LABEL" ? ownBrandNames : null);
  const businessActivities = [
    ...(hasOwnBrand ? ["Own brands"] : []),
    ...(hasWhiteLabel ? ["Manufacture for other brands"] : []),
    ...(hasWhiteLabel && whiteLabelWorkTypes.includes("JOB_WORK") ? ["Job work"] : []),
    ...(hasWhiteLabel && whiteLabelWorkTypes.includes("FOB") ? ["FOB"] : []),
  ];

  if (majorChallenges.length > 3) {
    throw new OrganizationKycValidationError("Choose no more than three business challenges.");
  }

  if (submitting) {
    if (staffCount === null || teamMemberCount === null || topManagementCount === null) {
      throw new OrganizationKycValidationError("Complete the team and worker counts.");
    }
    if (businessStartedYear === null) throw new OrganizationKycValidationError("Enter the year the business started.");
    if (!founderName || !founderDesignation) throw new OrganizationKycValidationError("Enter the founder name and designation.");
    if (products.length === 0) throw new OrganizationKycValidationError("Select the products your business deals with.");
    if (products.includes("Other") && !otherProduct) throw new OrganizationKycValidationError("Describe the other product you deal with.");
    if (usesSoftware === null) throw new OrganizationKycValidationError("Select whether you currently use software.");
    if (usesSoftware === "YES" && !enteredSoftwareUsed) throw new OrganizationKycValidationError("Enter the software names you currently use.");
    if (financeSoftware.length === 0) throw new OrganizationKycValidationError("Select the finance software you would like to integrate.");
    if (financeSoftware.includes("OTHER") && !financeSoftwareOther) throw new OrganizationKycValidationError("Enter the name of the other finance software.");
    if (financeSoftware.includes("NOT_SURE") && financeSoftware.length > 1) {
      throw new OrganizationKycValidationError("Select Not sure on its own, or choose the finance software to integrate.");
    }
    if (
      hasMerchandisers === null
      || hasDedicatedStoreIncharge === null
      || hasProductionManager === null
      || hasSeparateDispatchAccounts === null
    ) {
      throw new OrganizationKycValidationError("Answer each team responsibility question.");
    }
    if (majorChallenges.length === 0) throw new OrganizationKycValidationError("Select at least one major business challenge.");
    if (majorChallenges.includes("Other") && !majorChallengeOther) throw new OrganizationKycValidationError("Describe the other business challenge.");
    if (msmeStatus === null) throw new OrganizationKycValidationError("Select your MSME registration status.");
    if (lastYearTurnover === null) throw new OrganizationKycValidationError("Enter last financial year's turnover in rupees, or enter 0.");
    if (businessChannel === null) throw new OrganizationKycValidationError("Choose manufacturing, distribution, wholesale, or retail.");
    if (businessRole === null) throw new OrganizationKycValidationError("Select the business role that best describes your organization.");
    if (isDistributionWholesaleRetail && businessChannel === "MANUFACTURING") {
      throw new OrganizationKycValidationError("Choose distribution, wholesale, or retail for this business role.");
    }
    if (marketCoverage === null) throw new OrganizationKycValidationError("Choose export or domestic-only markets.");
    if (businessChannel === "MANUFACTURING" && brandModel === null) {
      throw new OrganizationKycValidationError("Select whether you work with your own brand, white label, or both.");
    }
    if (businessChannel !== "MANUFACTURING" && !isDistributionWholesaleRetail && !ownBrandNames) {
      throw new OrganizationKycValidationError("Enter at least one brand name.");
    }
    if (hasOwnBrand && !ownBrandNames) {
      throw new OrganizationKycValidationError("Enter at least one of your own brand names.");
    }
    if (hasWhiteLabel && !whiteLabelBrandNames) {
      throw new OrganizationKycValidationError("Enter the top white-label brands or customers you work with.");
    }
    if (isDistributionWholesaleRetail && !whiteLabelBrandNames) {
      throw new OrganizationKycValidationError("Enter at least one customer brand.");
    }
    if (hasWhiteLabel && whiteLabelWorkTypes.length === 0) {
      throw new OrganizationKycValidationError("Select whether your white-label work is FOB, job work, or both.");
    }
  }

  return {
    businessTypes,
    businessTypeOther,
    staffCount,
    factoryCount,
    outletCount,
    businessStartedYear,
    softwareUsed,
    majorChallenges,
    majorChallengeOther,
    brandsWorkedWith: whiteLabelBrandNames,
    monthlyProductionPcs,
    businessActivities,
    factoryArrangement: "NOT_APPLICABLE",
    kycDetails: {
      founderName,
      founderDesignation,
      teamMemberCount,
      topManagementCount,
      products,
      otherProduct: products.includes("Other") ? otherProduct : null,
      businessRole,
      washingUnit,
      embroideryUnit,
      shiftCount,
      businessChannel,
      marketCoverage,
      brandModel,
      ownBrandNames: isDistributionWholesaleRetail ? null : ownBrandNames,
      ownBrandChannels,
      whiteLabelFulfilment,
      whiteLabelBrands,
      whiteLabelWorkTypes,
      buyerNominatedRawMaterials,
      softwareModules,
      usesSoftware,
      financeSoftware,
      financeSoftwareOther: financeSoftware.includes("OTHER") ? financeSoftwareOther : null,
      hasMerchandisers,
      hasDedicatedStoreIncharge,
      hasProductionManager,
      hasSeparateDispatchAccounts,
      lastYearTurnover,
      msmeStatus,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown, allowed: readonly string[]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && allowed.includes(entry))
    : [];
}

function isNullableChoice(value: unknown, allowed: readonly string[]) {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function isNullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isNullableCount(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : null;
}

export function readOrganizationKycDetails(value: unknown): OrganizationKycDetails {
  const details = isRecord(value) ? value : {};
  return {
    founderName: isNullableText(details.founderName),
    founderDesignation: isNullableText(details.founderDesignation),
    teamMemberCount: isNullableCount(details.teamMemberCount, 1_000_000),
    topManagementCount: isNullableCount(details.topManagementCount, 100_000),
    products: isStringArray(details.products, ORGANIZATION_KYC_PRODUCTS),
    otherProduct: isNullableText(details.otherProduct),
    businessRole: isNullableChoice(details.businessRole, ORGANIZATION_KYC_BUSINESS_ROLES),
    washingUnit: isNullableChoice(details.washingUnit, ORGANIZATION_KYC_YES_NO),
    embroideryUnit: isNullableChoice(details.embroideryUnit, ORGANIZATION_KYC_YES_NO),
    shiftCount: isNullableCount(details.shiftCount, 100),
    businessChannel: isNullableChoice(details.businessChannel, ORGANIZATION_KYC_BUSINESS_CHANNELS),
    marketCoverage: isNullableChoice(details.marketCoverage, ORGANIZATION_KYC_MARKET_COVERAGE),
    brandModel: isNullableChoice(details.brandModel, ORGANIZATION_KYC_BRAND_MODELS),
    ownBrandNames: isNullableText(details.ownBrandNames),
    ownBrandChannels: isStringArray(details.ownBrandChannels, ORGANIZATION_KYC_OWN_BRAND_CHANNELS),
    whiteLabelFulfilment: isNullableChoice(details.whiteLabelFulfilment, ORGANIZATION_KYC_WHITE_LABEL_FULFILMENT),
    whiteLabelBrands: isNullableText(details.whiteLabelBrands),
    whiteLabelWorkTypes: isStringArray(details.whiteLabelWorkTypes, ORGANIZATION_KYC_WHITE_LABEL_WORK_TYPES),
    buyerNominatedRawMaterials: isNullableChoice(details.buyerNominatedRawMaterials, ORGANIZATION_KYC_RAW_MATERIAL_OPTIONS),
    softwareModules: isStringArray(details.softwareModules, ORGANIZATION_KYC_SOFTWARE_MODULES),
    usesSoftware: isNullableChoice(details.usesSoftware, ORGANIZATION_KYC_YES_NO),
    financeSoftware: isStringArray(details.financeSoftware, ORGANIZATION_KYC_FINANCE_SOFTWARE),
    financeSoftwareOther: isNullableText(details.financeSoftwareOther),
    hasMerchandisers: isNullableChoice(details.hasMerchandisers, ORGANIZATION_KYC_YES_NO),
    hasDedicatedStoreIncharge: isNullableChoice(details.hasDedicatedStoreIncharge, ORGANIZATION_KYC_YES_NO),
    hasProductionManager: isNullableChoice(details.hasProductionManager, ORGANIZATION_KYC_YES_NO),
    hasSeparateDispatchAccounts: isNullableChoice(details.hasSeparateDispatchAccounts, ORGANIZATION_KYC_YES_NO),
    lastYearTurnover: isNullableCount(details.lastYearTurnover, 10_000_000_000_000),
    msmeStatus: isNullableChoice(details.msmeStatus, ORGANIZATION_KYC_MSME_STATUSES),
  };
}
