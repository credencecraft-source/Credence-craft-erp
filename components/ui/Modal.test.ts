import { describe, expect, it } from "vitest";

import { MODAL_SIZE_CLASSES } from "./Modal";

describe("modal size presets", () => {
  it("provides the canonical square and rectangle dimensions", () => {
    expect(MODAL_SIZE_CLASSES.square).toBe("aspect-square max-w-[40rem]");
    expect(MODAL_SIZE_CLASSES.rectangle).toBe("aspect-[4/3] max-w-[72rem]");
  });

  it("maps legacy sizes to one of the two canonical layouts", () => {
    expect(MODAL_SIZE_CLASSES.sm).toBe(MODAL_SIZE_CLASSES.square);
    expect(MODAL_SIZE_CLASSES.md).toBe(MODAL_SIZE_CLASSES.square);
    expect(MODAL_SIZE_CLASSES.lg).toBe(MODAL_SIZE_CLASSES.square);
    expect(MODAL_SIZE_CLASSES.xl).toBe(MODAL_SIZE_CLASSES.rectangle);
    expect(MODAL_SIZE_CLASSES["2xl"]).toBe(MODAL_SIZE_CLASSES.rectangle);
  });
});
