import { prisma } from "@/lib/database/prisma-client";
import { createMasterValueForOrganization } from "@/lib/master-data/master-data-constants";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

export class FinishedGoodsCategoryHierarchyError extends Error {
  readonly status = 409;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

export async function createFinishedGoodsCategoryHierarchy(input: {
  organizationId: string;
  actorUserId: string;
  productType: string;
  existingCategory?: string;
  category: string;
  subcategory: string;
}) {
  const productType = normalizeUppercase(input.productType.trim());
  const categoryName = normalizeUppercase(input.category.trim());
  const subcategoryName = normalizeUppercase(input.subcategory.trim());
  const productTypeLookup = input.productType.trim();
  const existingCategoryName = normalizeUppercase(input.existingCategory?.trim() ?? "");
  if ((!productTypeLookup && !existingCategoryName) || !categoryName || !subcategoryName) {
    throw new FinishedGoodsCategoryHierarchyError("Finished Goods Type, Category, and Subcategory are required.");
  }
  if ([productType, existingCategoryName, categoryName, subcategoryName].some((value) => value.length > 255)) {
    throw new FinishedGoodsCategoryHierarchyError("Finished Goods Type, Category, and Subcategory must be 255 characters or fewer.");
  }

  const createHierarchy = () => prisma.$transaction(async (transaction) => {
    let product = productTypeLookup
      ? await transaction.masterProduct.findFirst({
          where: {
            organization_id: input.organizationId,
            OR: [
              { id: productTypeLookup },
              { value_id: productTypeLookup },
              { product_master_name: { equals: productType, mode: "insensitive" } },
            ],
          },
          select: { id: true, product_master_name: true, is_active: true },
        })
      : null;
    if (!product && !productTypeLookup && existingCategoryName) {
      const currentCategory = await transaction.masterCategory.findFirst({
        where: {
          organization_id: input.organizationId,
          category_name: { equals: existingCategoryName, mode: "insensitive" },
        },
        select: { product_master_id: true, is_active: true },
      });
      if (!currentCategory || !currentCategory.is_active) {
        throw new FinishedGoodsCategoryHierarchyError(
          `Existing Finished Goods Category "${existingCategoryName}" is unavailable. Revalidate the import row before creating its replacement.`,
        );
      }
      if (!currentCategory.product_master_id) {
        throw new FinishedGoodsCategoryHierarchyError(
          `Existing Finished Goods Category "${existingCategoryName}" has no Finished Goods Type. Correct its master data before retrying.`,
        );
      }
      product = await transaction.masterProduct.findFirst({
        where: {
          organization_id: input.organizationId,
          id: currentCategory.product_master_id,
        },
        select: { id: true, product_master_name: true, is_active: true },
      });
      if (!product) {
        throw new FinishedGoodsCategoryHierarchyError(
          `The Finished Goods Type for "${existingCategoryName}" is unavailable. Correct its master data before retrying.`,
        );
      }
    }
    if (!product || !product.is_active) {
      throw new FinishedGoodsCategoryHierarchyError(`Finished Goods Type "${productType}" is unavailable. Activate it before creating this category.`);
    }

    let categoryRecord = await transaction.masterCategory.findFirst({
      where: {
        organization_id: input.organizationId,
        product_master_id: product.id,
        category_name: { equals: categoryName, mode: "insensitive" },
      },
      select: { id: true, value_id: true, is_active: true },
    });
    let createdCategory = false;
    if (categoryRecord && !categoryRecord.is_active) {
      throw new FinishedGoodsCategoryHierarchyError(`Finished Goods Category "${categoryName}" already exists but is inactive. Activate it before retrying.`);
    }
    if (!categoryRecord) {
      categoryRecord = await createMasterValueForOrganization(input.organizationId, "category", {
        label: categoryName,
        fields: { Product_Master: product.product_master_name, Category_Name: categoryName },
        parentValueId: product.id,
        createOnly: true,
        actorUserId: input.actorUserId,
      }, transaction);
      createdCategory = true;
    }

    let subcategoryRecord = await transaction.masterSubCategory.findFirst({
      where: {
        organization_id: input.organizationId,
        sub_category: { equals: subcategoryName, mode: "insensitive" },
      },
      select: { id: true, value_id: true, category_id: true, is_active: true },
    });
    let createdSubcategory = false;
    let relinkedSubcategory = false;
    let previousSubcategoryCategoryId: string | null = null;
    if (subcategoryRecord && !subcategoryRecord.is_active) {
      throw new FinishedGoodsCategoryHierarchyError(`Finished Goods Subcategory "${subcategoryName}" already exists but is inactive. Activate it before retrying.`);
    }
    if (!subcategoryRecord) {
      const created = await createMasterValueForOrganization(input.organizationId, "sub-category", {
        label: subcategoryName,
        fields: { category: categoryName, sub_category: subcategoryName },
        parentValueId: categoryRecord.id,
        createOnly: true,
        actorUserId: input.actorUserId,
      }, transaction);
      subcategoryRecord = {
        id: created.id,
        value_id: created.value_id,
        category_id: categoryRecord.id,
        is_active: created.is_active,
      };
      createdSubcategory = true;
    } else if (subcategoryRecord.category_id !== categoryRecord.id) {
      previousSubcategoryCategoryId = subcategoryRecord.category_id;
      const relinked = await transaction.masterSubCategory.updateMany({
        where: {
          organization_id: input.organizationId,
          id: subcategoryRecord.id,
        },
        data: { category_id: categoryRecord.id },
      });
      if (relinked.count !== 1) {
        throw new FinishedGoodsCategoryHierarchyError(
          `Finished Goods Subcategory "${subcategoryName}" changed while this correction was being saved. Retry the action.`,
        );
      }
      subcategoryRecord = { ...subcategoryRecord, category_id: categoryRecord.id };
      relinkedSubcategory = true;
    }
    if (!subcategoryRecord) {
      throw new FinishedGoodsCategoryHierarchyError(
        `Unable to resolve Finished Goods Subcategory "${subcategoryName}".`,
      );
    }

    if (createdCategory) {
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        module: "master-data",
        action: "CREATE",
        entityType: "category",
        entityId: categoryRecord.value_id,
        details: { label: categoryName, productType, source: "import-correction" },
      }, transaction);
    }
    if (createdSubcategory) {
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        module: "master-data",
        action: "CREATE",
        entityType: "sub-category",
        entityId: subcategoryRecord.value_id,
        details: { label: subcategoryName, category: categoryName, source: "import-correction" },
      }, transaction);
    } else if (relinkedSubcategory) {
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        module: "master-data",
        action: "UPDATE",
        entityType: "sub-category",
        entityId: subcategoryRecord.value_id,
        details: {
          label: subcategoryName,
          before: { categoryId: previousSubcategoryCategoryId },
          after: { categoryId: categoryRecord.id, category: categoryName },
          source: "import-correction",
        },
      }, transaction);
    }

    return {
      category: categoryName,
      subcategory: subcategoryName,
      createdCategory,
      createdSubcategory,
      relinkedSubcategory,
    };
  }, { maxWait: 10_000, timeout: 30_000 });

  try {
    return await createHierarchy();
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    try {
      return await createHierarchy();
    } catch (retryError) {
      if (!isUniqueConstraintError(retryError)) throw retryError;
      throw new FinishedGoodsCategoryHierarchyError(
        "A matching Finished Goods Category or Subcategory changed concurrently. Refresh the import row and retry.",
      );
    }
  }
}
