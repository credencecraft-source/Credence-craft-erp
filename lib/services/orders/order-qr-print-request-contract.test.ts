import { describe, expect, it } from "vitest";

import {
  getNextOrderQrPrintRequestStatus,
  parseCreateOrderQrPrintRequestInput,
} from "./order-qr-print-request-contract";

describe("order QR print request contract", () => {
  it("accepts only a valid order, optional template, and supported request type", () => {
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
    })).toEqual({
      success: true,
      data: {
        orderId: "order-1",
        templateId: "template-1",
        requestType: "PRINT",
      },
    });
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      requestType: "DOWNLOAD",
    })).toEqual({
      success: true,
      data: { orderId: "order-1", templateId: null, requestType: "DOWNLOAD" },
    });
  });

  it("rejects malformed or unsupported request input", () => {
    expect(parseCreateOrderQrPrintRequestInput(null).success).toBe(false);
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "",
      requestType: "PRINT",
    }).success).toBe(false);
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      requestType: "DELETE",
    }).success).toBe(false);
  });

  it("enforces the pending-to-progress-to-completed lifecycle", () => {
    expect(getNextOrderQrPrintRequestStatus("PENDING")).toBe("IN_PROGRESS");
    expect(getNextOrderQrPrintRequestStatus("IN_PROGRESS")).toBe("COMPLETED");
    expect(getNextOrderQrPrintRequestStatus("COMPLETED")).toBeNull();
  });
});
