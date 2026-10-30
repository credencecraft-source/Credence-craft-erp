import { normalizeUppercase } from "@/lib/utilities/text-case";

export const PAGE_SETUP_PAPER_SIZES = ["A4", "A3", "LETTER"] as const;
export const PAGE_SETUP_ORIENTATIONS = ["PORTRAIT", "LANDSCAPE"] as const;
export const DEFAULT_PAGE_SETUP_STICKER_WIDTH_MM = 50;
export const DEFAULT_PAGE_SETUP_STICKER_LENGTH_MM = 30;
export const DEFAULT_PAGE_SETUP_MARGIN_MM = 5;
export const DEFAULT_PAGE_SETUP_GAP_MM = 2;
export const PAGE_SETUP_STICKER_MIN_MM = 1;
export const PAGE_SETUP_STICKER_MAX_MM = 500;
export const PAGE_SETUP_MARGIN_MAX_MM = 100;
export const PAGE_SETUP_GAP_MAX_MM = 50;

export type PageSetupPaperSize = (typeof PAGE_SETUP_PAPER_SIZES)[number];
export type PageSetupOrientation = (typeof PAGE_SETUP_ORIENTATIONS)[number];

export type PageSetupTemplateInput = {
  name: string;
  paperSize: PageSetupPaperSize;
  orientation: PageSetupOrientation;
  stickerWidthMm: number;
  stickerLengthMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
};

export type PageSetupPrintSnapshot = PageSetupTemplateInput & {
  id: string;
};

export type PageSetupLayout = Pick<
  PageSetupTemplateInput,
  | "marginTopMm"
  | "marginBottomMm"
  | "marginLeftMm"
  | "marginRightMm"
  | "horizontalGapMm"
  | "verticalGapMm"
>;

export const DEFAULT_PAGE_SETUP_LAYOUT: PageSetupLayout = {
  marginTopMm: DEFAULT_PAGE_SETUP_MARGIN_MM,
  marginBottomMm: DEFAULT_PAGE_SETUP_MARGIN_MM,
  marginLeftMm: DEFAULT_PAGE_SETUP_MARGIN_MM,
  marginRightMm: DEFAULT_PAGE_SETUP_MARGIN_MM,
  horizontalGapMm: DEFAULT_PAGE_SETUP_GAP_MM,
  verticalGapMm: DEFAULT_PAGE_SETUP_GAP_MM,
};

export type PageSetupDimensions = {
  pageWidthMm: number;
  pageLengthMm: number;
};

const PAPER_DIMENSIONS: Record<PageSetupPaperSize, PageSetupDimensions> = {
  A4: { pageWidthMm: 210, pageLengthMm: 297 },
  A3: { pageWidthMm: 297, pageLengthMm: 420 },
  LETTER: { pageWidthMm: 215.9, pageLengthMm: 279.4 },
};

export function getPageSetupDimensions(
  paperSize: PageSetupPaperSize,
  orientation: PageSetupOrientation,
): PageSetupDimensions {
  const dimensions = PAPER_DIMENSIONS[paperSize];
  return orientation === "LANDSCAPE"
    ? { pageWidthMm: dimensions.pageLengthMm, pageLengthMm: dimensions.pageWidthMm }
    : dimensions;
}

export function getPageSetupStickerGrid(
  paperSize: PageSetupPaperSize,
  orientation: PageSetupOrientation,
  stickerWidthMm: number,
  stickerLengthMm: number,
  layout: PageSetupLayout,
) {
  const { pageWidthMm, pageLengthMm } = getPageSetupDimensions(paperSize, orientation);
  if (
    !Number.isFinite(stickerWidthMm)
    || !Number.isFinite(stickerLengthMm)
    || stickerWidthMm <= 0
    || stickerLengthMm <= 0
  ) {
    return {
      pageWidthMm,
      pageLengthMm,
      columns: 0,
      rows: 0,
      count: 0,
      gridWidthMm: 0,
      gridLengthMm: 0,
      startXmm: layout.marginLeftMm,
      startYmm: layout.marginTopMm,
    };
  }
  const usableWidth = pageWidthMm - layout.marginLeftMm - layout.marginRightMm;
  const usableLength = pageLengthMm - layout.marginTopMm - layout.marginBottomMm;
  if (usableWidth <= 0 || usableLength <= 0) {
    return {
      pageWidthMm,
      pageLengthMm,
      columns: 0,
      rows: 0,
      count: 0,
      gridWidthMm: 0,
      gridLengthMm: 0,
      startXmm: layout.marginLeftMm,
      startYmm: layout.marginTopMm,
    };
  }
  const horizontalStep = stickerWidthMm + layout.horizontalGapMm;
  const verticalStep = stickerLengthMm + layout.verticalGapMm;
  const columns = usableWidth >= stickerWidthMm
    ? Math.floor((usableWidth + layout.horizontalGapMm + Number.EPSILON) / horizontalStep)
    : 0;
  const rows = usableLength >= stickerLengthMm
    ? Math.floor((usableLength + layout.verticalGapMm + Number.EPSILON) / verticalStep)
    : 0;

  return {
    pageWidthMm,
    pageLengthMm,
    columns,
    rows,
    count: columns * rows,
    gridWidthMm: columns > 0
      ? columns * stickerWidthMm + (columns - 1) * layout.horizontalGapMm
      : 0,
    gridLengthMm: rows > 0
      ? rows * stickerLengthMm + (rows - 1) * layout.verticalGapMm
      : 0,
    startXmm: layout.marginLeftMm,
    startYmm: layout.marginTopMm,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePageSetupPrintSnapshot(
  value: unknown,
): PageSetupPrintSnapshot | null {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || !value.id
    || typeof value.name !== "string"
    || !PAGE_SETUP_PAPER_SIZES.includes(value.paperSize as PageSetupPaperSize)
    || !PAGE_SETUP_ORIENTATIONS.includes(value.orientation as PageSetupOrientation)
  ) {
    return null;
  }

  const numericFields = [
    "stickerWidthMm",
    "stickerLengthMm",
    "marginTopMm",
    "marginBottomMm",
    "marginLeftMm",
    "marginRightMm",
    "horizontalGapMm",
    "verticalGapMm",
  ] as const;
  if (numericFields.some((field) =>
    typeof value[field] !== "number" || !Number.isFinite(value[field]),
  )) {
    return null;
  }

  const stickerWidthMm = Number(value.stickerWidthMm);
  const stickerLengthMm = Number(value.stickerLengthMm);
  const marginTopMm = Number(value.marginTopMm);
  const marginBottomMm = Number(value.marginBottomMm);
  const marginLeftMm = Number(value.marginLeftMm);
  const marginRightMm = Number(value.marginRightMm);
  const horizontalGapMm = Number(value.horizontalGapMm);
  const verticalGapMm = Number(value.verticalGapMm);
  if (
    stickerWidthMm < PAGE_SETUP_STICKER_MIN_MM
    || stickerWidthMm > PAGE_SETUP_STICKER_MAX_MM
    || stickerLengthMm < PAGE_SETUP_STICKER_MIN_MM
    || stickerLengthMm > PAGE_SETUP_STICKER_MAX_MM
    || marginTopMm < 0
    || marginTopMm > PAGE_SETUP_MARGIN_MAX_MM
    || marginBottomMm < 0
    || marginBottomMm > PAGE_SETUP_MARGIN_MAX_MM
    || marginLeftMm < 0
    || marginLeftMm > PAGE_SETUP_MARGIN_MAX_MM
    || marginRightMm < 0
    || marginRightMm > PAGE_SETUP_MARGIN_MAX_MM
    || horizontalGapMm < 0
    || horizontalGapMm > PAGE_SETUP_GAP_MAX_MM
    || verticalGapMm < 0
    || verticalGapMm > PAGE_SETUP_GAP_MAX_MM
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    paperSize: value.paperSize as PageSetupPaperSize,
    orientation: value.orientation as PageSetupOrientation,
    stickerWidthMm,
    stickerLengthMm,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    horizontalGapMm,
    verticalGapMm,
  };
}

export function parsePageSetupTemplateInput(
  value: unknown,
): { success: true; data: PageSetupTemplateInput } | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: "Page setup details are required." };
  }
  if (typeof value.name !== "string") {
    return { success: false, error: "Template name is required." };
  }

  const name = normalizeUppercase(value.name.trim());
  if (!name || name.length > 100) {
    return { success: false, error: "Enter a template name between 1 and 100 characters." };
  }
  if (!PAGE_SETUP_PAPER_SIZES.includes(value.paperSize as PageSetupPaperSize)) {
    return { success: false, error: "Select a supported paper size." };
  }
  if (!PAGE_SETUP_ORIENTATIONS.includes(value.orientation as PageSetupOrientation)) {
    return { success: false, error: "Select a supported page orientation." };
  }
  const stickerWidthMm = value.stickerWidthMm;
  const stickerLengthMm = value.stickerLengthMm;
  if (
    typeof stickerWidthMm !== "number"
    || !Number.isFinite(stickerWidthMm)
    || stickerWidthMm < PAGE_SETUP_STICKER_MIN_MM
    || stickerWidthMm > PAGE_SETUP_STICKER_MAX_MM
  ) {
    return {
      success: false,
      error: `Sticker width must be between ${PAGE_SETUP_STICKER_MIN_MM} and ${PAGE_SETUP_STICKER_MAX_MM} mm.`,
    };
  }
  const layoutValues = [
    ["Top margin", value.marginTopMm ?? DEFAULT_PAGE_SETUP_LAYOUT.marginTopMm, PAGE_SETUP_MARGIN_MAX_MM],
    ["Bottom margin", value.marginBottomMm ?? DEFAULT_PAGE_SETUP_LAYOUT.marginBottomMm, PAGE_SETUP_MARGIN_MAX_MM],
    ["Left margin", value.marginLeftMm ?? DEFAULT_PAGE_SETUP_LAYOUT.marginLeftMm, PAGE_SETUP_MARGIN_MAX_MM],
    ["Right margin", value.marginRightMm ?? DEFAULT_PAGE_SETUP_LAYOUT.marginRightMm, PAGE_SETUP_MARGIN_MAX_MM],
    ["Horizontal gap", value.horizontalGapMm ?? DEFAULT_PAGE_SETUP_LAYOUT.horizontalGapMm, PAGE_SETUP_GAP_MAX_MM],
    ["Vertical gap", value.verticalGapMm ?? DEFAULT_PAGE_SETUP_LAYOUT.verticalGapMm, PAGE_SETUP_GAP_MAX_MM],
  ] as const;
  for (const [label, dimension, maximum] of layoutValues) {
    if (
      typeof dimension !== "number"
      || !Number.isFinite(dimension)
      || dimension < 0
      || dimension > maximum
    ) {
      return {
        success: false,
        error: `${label} must be between 0 and ${maximum} mm.`,
      };
    }
  }
  if (
    typeof stickerLengthMm !== "number"
    || !Number.isFinite(stickerLengthMm)
    || stickerLengthMm < PAGE_SETUP_STICKER_MIN_MM
    || stickerLengthMm > PAGE_SETUP_STICKER_MAX_MM
  ) {
    return {
      success: false,
      error: `Sticker length must be between ${PAGE_SETUP_STICKER_MIN_MM} and ${PAGE_SETUP_STICKER_MAX_MM} mm.`,
    };
  }

  return {
    success: true,
    data: {
      name,
      paperSize: value.paperSize as PageSetupPaperSize,
      orientation: value.orientation as PageSetupOrientation,
      stickerWidthMm,
      stickerLengthMm,
      marginTopMm: layoutValues[0][1] as number,
      marginBottomMm: layoutValues[1][1] as number,
      marginLeftMm: layoutValues[2][1] as number,
      marginRightMm: layoutValues[3][1] as number,
      horizontalGapMm: layoutValues[4][1] as number,
      verticalGapMm: layoutValues[5][1] as number,
    },
  };
}
