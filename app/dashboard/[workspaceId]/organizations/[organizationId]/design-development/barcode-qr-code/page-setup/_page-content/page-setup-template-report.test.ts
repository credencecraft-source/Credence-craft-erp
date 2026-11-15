import { describe, expect, it } from "vitest";

import {
  mapPageSetupTemplateToReportRow,
  type ApiPageSetupTemplate,
} from "./page-setup-template-report";

const template: ApiPageSetupTemplate = {
  id: "setup-1",
  name: "Label setup",
  printerType: "LASER",
  paperSize: "A4",
  paperWidthMm: null,
  paperLengthMm: null,
  orientation: "PORTRAIT",
  stickerWidthMm: 50,
  stickerLengthMm: 30,
  marginTopMm: 5,
  marginBottomMm: 5,
  marginLeftMm: 5,
  marginRightMm: 5,
  horizontalGapMm: 2,
  verticalGapMm: 2,
  updatedAt: "2026-10-28T00:00:00.000Z",
};

describe("Page Setup report row mapping", () => {
  it("maps decoded custom paper sizes from the API without reparsing stored values", () => {
    expect(mapPageSetupTemplateToReportRow({
      ...template,
      paperSize: "CUSTOM",
      paperWidthMm: 120,
      paperLengthMm: 200,
    })).toMatchObject({
      printerType: "Laser",
      paperSize: "Custom · 120 × 200 mm",
      orientation: "PORTRAIT",
    });
  });

  it("maps thermal roll paper sizes from the API", () => {
    expect(mapPageSetupTemplateToReportRow({
      ...template,
      printerType: "THERMAL",
      paperSize: "ROLL",
      paperWidthMm: 58,
      paperLengthMm: null,
    })).toMatchObject({
      printerType: "Thermal",
      paperSize: "Roll · 58 mm wide · automatic length",
      orientation: "Not applicable",
    });
  });
});
