import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import type { PageSetupTemplateInput } from "./page-setup-template-contract";

const templateFields = {
  id: true,
  name: true,
  paper_size: true,
  orientation: true,
  sticker_width_mm: true,
  sticker_length_mm: true,
  margin_top_mm: true,
  margin_bottom_mm: true,
  margin_left_mm: true,
  margin_right_mm: true,
  horizontal_gap_mm: true,
  vertical_gap_mm: true,
  created_at: true,
  updated_at: true,
} as const;

export class PageSetupTemplateDeleteConflictError extends Error {
  constructor() {
    super("The Page Setup template selection changed during deletion.");
    this.name = "PageSetupTemplateDeleteConflictError";
  }
}

function mapTemplate(template: {
  id: string;
  name: string;
  paper_size: string;
  orientation: string;
  sticker_width_mm: number | { toNumber(): number };
  sticker_length_mm: number | { toNumber(): number };
  margin_top_mm: number | { toNumber(): number };
  margin_bottom_mm: number | { toNumber(): number };
  margin_left_mm: number | { toNumber(): number };
  margin_right_mm: number | { toNumber(): number };
  horizontal_gap_mm: number | { toNumber(): number };
  vertical_gap_mm: number | { toNumber(): number };
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    paperSize: template.paper_size,
    orientation: template.orientation,
    stickerWidthMm: typeof template.sticker_width_mm === "number"
      ? template.sticker_width_mm
      : template.sticker_width_mm.toNumber(),
    stickerLengthMm: typeof template.sticker_length_mm === "number"
      ? template.sticker_length_mm
      : template.sticker_length_mm.toNumber(),
    marginTopMm: typeof template.margin_top_mm === "number"
      ? template.margin_top_mm
      : template.margin_top_mm.toNumber(),
    marginBottomMm: typeof template.margin_bottom_mm === "number"
      ? template.margin_bottom_mm
      : template.margin_bottom_mm.toNumber(),
    marginLeftMm: typeof template.margin_left_mm === "number"
      ? template.margin_left_mm
      : template.margin_left_mm.toNumber(),
    marginRightMm: typeof template.margin_right_mm === "number"
      ? template.margin_right_mm
      : template.margin_right_mm.toNumber(),
    horizontalGapMm: typeof template.horizontal_gap_mm === "number"
      ? template.horizontal_gap_mm
      : template.horizontal_gap_mm.toNumber(),
    verticalGapMm: typeof template.vertical_gap_mm === "number"
      ? template.vertical_gap_mm
      : template.vertical_gap_mm.toNumber(),
    createdAt: template.created_at.toISOString(),
    updatedAt: template.updated_at.toISOString(),
  };
}

export async function listPageSetupTemplates(userId: string, publicOrganizationId: string) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "VIEW_REPORTS",
  );
  const templates = await prisma.designDevelopmentPageSetupTemplate.findMany({
    where: { organization_id: membership.organization_id },
    orderBy: [{ updated_at: "desc" }, { name: "asc" }],
    take: 100,
    select: templateFields,
  });
  return templates.map(mapTemplate);
}

export async function getPageSetupTemplate(
  userId: string,
  publicOrganizationId: string,
  templateId: string,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "VIEW_REPORTS",
  );
  const template = await prisma.designDevelopmentPageSetupTemplate.findFirst({
    where: { organization_id: membership.organization_id, id: templateId },
    select: templateFields,
  });
  return template ? mapTemplate(template) : null;
}

export async function createPageSetupTemplate(
  userId: string,
  publicOrganizationId: string,
  input: PageSetupTemplateInput,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const template = await transaction.designDevelopmentPageSetupTemplate.create({
      data: {
        organization_id: membership.organization_id,
        name: normalizeUppercase(input.name.trim()),
        paper_size: input.paperSize,
        orientation: input.orientation,
        sticker_width_mm: input.stickerWidthMm,
        sticker_length_mm: input.stickerLengthMm,
        margin_top_mm: input.marginTopMm,
        margin_bottom_mm: input.marginBottomMm,
        margin_left_mm: input.marginLeftMm,
        margin_right_mm: input.marginRightMm,
        horizontal_gap_mm: input.horizontalGapMm,
        vertical_gap_mm: input.verticalGapMm,
      },
      select: templateFields,
    });
    return mapTemplate(template);
  });
}

export async function updatePageSetupTemplate(
  userId: string,
  publicOrganizationId: string,
  templateId: string,
  input: PageSetupTemplateInput,
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const updated = await transaction.designDevelopmentPageSetupTemplate.updateMany({
      where: { organization_id: membership.organization_id, id: templateId },
      data: {
        name: normalizeUppercase(input.name.trim()),
        paper_size: input.paperSize,
        orientation: input.orientation,
        sticker_width_mm: input.stickerWidthMm,
        sticker_length_mm: input.stickerLengthMm,
        margin_top_mm: input.marginTopMm,
        margin_bottom_mm: input.marginBottomMm,
        margin_left_mm: input.marginLeftMm,
        margin_right_mm: input.marginRightMm,
        horizontal_gap_mm: input.horizontalGapMm,
        vertical_gap_mm: input.verticalGapMm,
      },
    });
    if (updated.count !== 1) return null;

    const template = await transaction.designDevelopmentPageSetupTemplate.findFirst({
      where: { organization_id: membership.organization_id, id: templateId },
      select: templateFields,
    });
    return template ? mapTemplate(template) : null;
  });
}

export async function deletePageSetupTemplates(
  userId: string,
  publicOrganizationId: string,
  templateIds: string[],
) {
  const membership = await requireOrganizationPermission(
    userId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    const existing = await transaction.designDevelopmentPageSetupTemplate.findMany({
      where: {
        organization_id: membership.organization_id,
        id: { in: templateIds },
      },
      select: { id: true },
    });
    if (existing.length !== templateIds.length) {
      return { success: false as const, reason: "NOT_FOUND" as const };
    }

    const deleted = await transaction.designDevelopmentPageSetupTemplate.deleteMany({
      where: {
        organization_id: membership.organization_id,
        id: { in: templateIds },
      },
    });
    if (deleted.count !== templateIds.length) {
      throw new PageSetupTemplateDeleteConflictError();
    }
    return { success: true as const, deletedCount: deleted.count };
  });
}
