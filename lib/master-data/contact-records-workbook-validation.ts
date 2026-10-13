import type { ContactWorkbookImportResult } from "@/lib/master-data/contact-records-workbook-parser";

type WorkerResponse =
  | { ok: true; result: ContactWorkbookImportResult }
  | { ok: false; error: string };

export function validateContactWorkbookInBackground(file: File): Promise<ContactWorkbookImportResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./contact-records-workbook.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(new Error("Unable to start background workbook validation in this browser."));
      return;
    }

    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Background workbook validation failed. Please try again."));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error("The validation result could not be read. Please try again."));
    };
    worker.postMessage(file);
  });
}
