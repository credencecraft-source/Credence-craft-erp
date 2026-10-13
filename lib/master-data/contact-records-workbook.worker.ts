import { parseContactWorkbook } from "@/lib/master-data/contact-records-workbook-parser";

type ValidationResponse =
  | { ok: true; result: Awaited<ReturnType<typeof parseContactWorkbook>> }
  | { ok: false; error: string };

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  void (async () => {
    try {
      if (typeof File === "undefined" || !(event.data instanceof File)) {
        throw new Error("The workbook could not be read.");
      }
      const result = await parseContactWorkbook(event.data);
      const response: ValidationResponse = { ok: true, result };
      self.postMessage(response);
    } catch (error) {
      const response: ValidationResponse = {
        ok: false,
        error: error instanceof Error ? error.message : "The workbook could not be validated.",
      };
      self.postMessage(response);
    }
  })();
});
