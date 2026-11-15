import {
  getPageSetupPaperSizeLabel,
  type PageSetupOrientation,
  type PageSetupPaperSize,
  type PageSetupPrinterType,
} from "@/lib/services/design-development/page-setup-template-contract";

export type ApiPageSetupTemplate = {
  id: string;
  name: string;
  printerType: PageSetupPrinterType;
  paperSize: PageSetupPaperSize;
  paperWidthMm: number | null;
  paperLengthMm: number | null;
  orientation: PageSetupOrientation;
  stickerWidthMm: number;
  stickerLengthMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  horizontalGapMm: number;
  verticalGapMm: number;
  updatedAt: string;
};

export type PageSetupReportRow = {
  id: string;
  name: string;
  printerType: string;
  paperSize: string;
  orientation: string;
  stickerSize: string;
  margins: string;
  stickerGaps: string;
  updatedAt: string;
};

export function mapPageSetupTemplateToReportRow(
  template: ApiPageSetupTemplate,
): PageSetupReportRow {
  const isThermal = template.printerType === "THERMAL";
  const hasCustomDimensions =
    template.paperSize === "CUSTOM"
    && template.paperWidthMm !== null
    && template.paperLengthMm !== null;

  return {
    id: template.id,
    name: template.name,
    printerType: isThermal ? "Thermal" : "Laser",
    paperSize: isThermal
      ? `Roll · ${template.paperWidthMm} mm wide · automatic length`
      : hasCustomDimensions
        ? `Custom · ${template.paperWidthMm} × ${template.paperLengthMm} mm`
        : getPageSetupPaperSizeLabel(template.paperSize),
    orientation: isThermal ? "Not applicable" : template.orientation,
    stickerSize: `${template.stickerWidthMm} × ${template.stickerLengthMm} mm`,
    margins: [
      template.marginTopMm,
      template.marginBottomMm,
      template.marginLeftMm,
      template.marginRightMm,
    ].join(" / "),
    stickerGaps: `${template.horizontalGapMm} / ${template.verticalGapMm}`,
    updatedAt: new Date(template.updatedAt).toLocaleDateString(),
  };
}
