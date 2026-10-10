import { prisma } from "@/lib/database/prisma-client";
import { createMasterValueForOrganization, getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { getMasterDefinition } from "@/lib/master-data/master-data-registry";

export type OrganizationMasterSetupRecord = {
  moduleKey: string;
  label: string;
  fields: Record<string, string | number | boolean | null | string[]>;
};

export const ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS = new Set([
  "article", "category-type", "gold-seal", "gold-seal-variant", "gst", "gst-type", "hsn",
  "measurement-chart", "operation", "operation-template", "raw-material", "raw-material-type",
  "season", "size-wise-consumption", "state", "category",
]);

type ActiveMaster = { id: string; is_active: boolean };

async function findOrCreateStarterMaster<T extends ActiveMaster>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  isCompatible: (record: T) => boolean,
  label: string,
): Promise<{ record: T; created: boolean }> {
  const existing = await find();
  if (!existing) return { record: await create(), created: true };
  if (!existing.is_active) {
    throw new Error(`${label} already exists but is inactive. Activate it before creating starter masters.`);
  }
  if (!isCompatible(existing)) {
    throw new Error(`${label} already exists with a different parent or brand.`);
  }
  return { record: existing, created: false };
}

export async function createOrganizationMerchandisingStarterMasters(organizationId: string) {
  if (!organizationId) throw new Error("Organization is required.");

  return prisma.$transaction(async (transaction) => {
    const product = await transaction.masterProduct.findFirst({
      where: {
        organization_id: organizationId,
        product_master_name: { equals: "Finished Goods", mode: "insensitive" },
        is_active: true,
      },
      select: { id: true },
    });
    if (!product) {
      throw new Error("An active Finished Goods product type is required. Complete organization master setup first.");
    }

    let createdCount = 0;
    const save = async <T extends ActiveMaster>(result: Promise<{ record: T; created: boolean }>) => {
      const saved = await result;
      if (saved.created) createdCount += 1;
      return saved.record;
    };
    const createRecord = async <T extends ActiveMaster>(
      find: () => Promise<T | null>,
      create: () => Promise<T>,
      isCompatible: (record: T) => boolean,
      label: string,
    ) => save(findOrCreateStarterMaster(find, create, isCompatible, label));

    const brands = new Map<string, string>();
    for (const [index, name] of [
      "Louis Philippe", "Peter England", "Allen Solly", "Andamen", "Benetton",
      "Royal Enfield", "Blackberry", "Snitch", "Polar Bear",
    ].entries()) {
      const brand = await createRecord(
        () => transaction.masterBrand.findFirst({
          where: { organization_id: organizationId, brand: { equals: name, mode: "insensitive" } },
        }),
        () => transaction.masterBrand.create({
          data: { organization_id: organizationId, brand: name, is_active: true, sort_order: index },
        }),
        () => true,
        `Brand "${name}"`,
      );
      brands.set(name, brand.id);
    }

    for (const [index, name] of ["Madurai Fashion", "Lifestyle Fashion"].entries()) {
      await createRecord(
        () => transaction.masterBuyer.findFirst({
          where: { organization_id: organizationId, buyer_name: { equals: name, mode: "insensitive" } },
        }),
        () => transaction.masterBuyer.create({
          data: { organization_id: organizationId, buyer_name: name, is_active: true, sort_order: index },
        }),
        () => true,
        `Buyer "${name}"`,
      );
    }

    const sizeIds = new Map<string, string>();
    for (const [index, name] of ["S", "M", "L", "XL", "XXL", "32", "34", "36", "38", "40"].entries()) {
      const size = await createRecord(
        () => transaction.masterSize.findFirst({
          where: { organization_id: organizationId, size: { equals: name, mode: "insensitive" } },
        }),
        () => transaction.masterSize.create({
          data: { organization_id: organizationId, size: name, is_active: true, sort_order: index },
        }),
        () => true,
        `Size "${name}"`,
      );
      sizeIds.set(name, size.id);
    }

    for (const [index, group] of [
      { name: "Shirt S-XXL", sizes: ["S", "M", "L", "XL", "XXL"] },
      { name: "Pant 32-40", sizes: ["32", "34", "36", "38", "40"] },
    ].entries()) {
      const brandId = brands.get("Louis Philippe");
      if (!brandId) throw new Error("The Louis Philippe brand could not be resolved.");
      const sizeGroup = await createRecord(
        () => transaction.masterSizeGroup.findFirst({
          where: { organization_id: organizationId, size_group: { equals: group.name, mode: "insensitive" } },
        }),
        () => transaction.masterSizeGroup.create({
          data: { organization_id: organizationId, brand_id: brandId, size_group: group.name, is_active: true, sort_order: index },
        }),
        (record) => record.brand_id === brandId,
        `Size group "${group.name}"`,
      );
      for (const sizeName of group.sizes) {
        const sizeId = sizeIds.get(sizeName);
        if (!sizeId) throw new Error(`Size "${sizeName}" could not be resolved.`);
        const existingLink = await transaction.masterSizeGroupSize.findFirst({
          where: { organization_id: organizationId, size_group_id: sizeGroup.id, size_id: sizeId },
          select: { id: true },
        });
        if (!existingLink) {
          await transaction.masterSizeGroupSize.create({
            data: { organization_id: organizationId, size_group_id: sizeGroup.id, size_id: sizeId },
          });
          createdCount += 1;
        }
      }
    }

    const categories = new Map<string, string>();
    for (const [index, name] of ["Shirt", "Pant", "Kurta", "Suits"].entries()) {
      const category = await createRecord(
        () => transaction.masterCategory.findFirst({
          where: { organization_id: organizationId, category_name: { equals: name, mode: "insensitive" } },
        }),
        () => transaction.masterCategory.create({
          data: { organization_id: organizationId, product_master_id: product.id, category_name: name, is_active: true, sort_order: index },
        }),
        (record) => record.product_master_id === product.id,
        `Category "${name}"`,
      );
      categories.set(name, category.id);
    }

    const shirtCategoryId = categories.get("Shirt");
    if (!shirtCategoryId) throw new Error("The Shirt category could not be resolved.");
    await createRecord(
      () => transaction.masterSubCategory.findFirst({
        where: { organization_id: organizationId, sub_category: { equals: "Full Sleeve", mode: "insensitive" } },
      }),
      () => transaction.masterSubCategory.create({
        data: { organization_id: organizationId, category_id: shirtCategoryId, sub_category: "Full Sleeve", is_active: true, sort_order: 0 },
      }),
      (record) => record.category_id === shirtCategoryId,
      "Subcategory \"Full Sleeve\"",
    );

    return { createdCount };
  });
}

export async function createOrganizationMasterSetupStage(
  organizationId: string,
  records: OrganizationMasterSetupRecord[],
) {
  for (const record of records) {
    const definition = getMasterDefinition(record.moduleKey);
    if (!definition || definition.hidden || ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS.has(record.moduleKey)) {
      throw new Error("One of the selected master types is not available.");
    }

    const label = record.label.trim();
    if (!label) continue;

    const created = await createMasterValueForOrganization(organizationId, record.moduleKey, {
      label,
      fields: record.fields,
    });
    if (record.moduleKey === "process-template") {
      const processIds = Array.isArray(record.fields.Process) ? record.fields.Process.map(String).filter(Boolean) : [];
      const processOptions = await getMasterValuesForOrganization(organizationId, "process-master", true);
      const processLabels = new Map(processOptions.map((option) => [option.id, option.label]));
      for (const [index, processId] of processIds.entries()) {
        await createMasterValueForOrganization(organizationId, "process-template-step", {
          label: processLabels.get(processId) ?? processId,
          parentValueId: created.id,
          fields: { Process: processId, Sl_No: index + 1 },
        });
      }
    }
  }
}