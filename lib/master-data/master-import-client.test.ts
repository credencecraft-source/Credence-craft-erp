import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadMasterWorkbookToHistory } from "@/lib/master-data/master-import-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadMasterWorkbookToHistory", () => {
  it("saves the selected workbook and module to the organization import endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      job: {
        id: "import-123",
        moduleKey: "contact",
        uploadedFileName: "contacts.xlsx",
        status: "UPLOADED",
        totalRows: 0,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["workbook"], "contacts.xlsx");
    const job = await uploadMasterWorkbookToHistory("org/123", "contact", file);

    expect(job.id).toBe("import-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/organizations/org%2F123/master-imports");
    expect(request.method).toBe("POST");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("moduleKey")).toBe("contact");
    expect((request.body as FormData).get("file")).toBe(file);
  });

  it("surfaces the server error when upload is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { error: "Upload an .xlsx workbook." },
      { status: 400 },
    )));

    await expect(uploadMasterWorkbookToHistory(
      "organization-123",
      "contact",
      new File(["not a workbook"], "contacts.xlsx"),
    )).rejects.toThrow("Upload an .xlsx workbook.");
  });
});
