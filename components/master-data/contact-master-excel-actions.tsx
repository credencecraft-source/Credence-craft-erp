"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  parseContactWorkbook,
  type ContactWorkbookImportResult,
  type ContactWorkbookRecord,
} from "@/lib/master-data/contact-records-workbook-parser";

type ContactMasterExcelActionsProps = {
  contacts: ContactWorkbookRecord[];
  endpoint: string;
};

type ImportSummary = {
  created: number;
  failureCount: number;
  failures: Array<{ contactKey: string; message: string }>;
};

type ImportProgress = {
  created: number;
  processed: number;
  total: number;
};

const IMPORT_BATCH_SIZE = 10;

export default function ContactMasterExcelActions({
  contacts,
  endpoint,
}: ContactMasterExcelActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validatedImport, setValidatedImport] = useState<ContactWorkbookImportResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const downloadWorkbook = async (includeContacts: boolean) => {
    setDownloadError("");
    setIsGenerating(true);
    try {
      let exportContacts = contacts;
      if (includeContacts) {
        const allContacts: ContactWorkbookRecord[] = [];
        const pageSize = 200;
        for (let offset = 0; ; offset += pageSize) {
          const response = await fetch(`${endpoint}?limit=${pageSize}&offset=${offset}`, { cache: "no-store" });
          const result: unknown = await response.json();
          if (!response.ok) {
            throw new Error(
              typeof result === "object" && result !== null && "error" in result
                ? String(result.error)
                : "Unable to load all contacts for export.",
            );
          }
          if (!Array.isArray(result)) throw new Error("Unable to load all contacts for export.");
          allContacts.push(...result as ContactWorkbookRecord[]);
          if (result.length < pageSize) break;
        }
        exportContacts = allContacts;
      }
      const workbookResponse = await fetch(`${endpoint}/workbook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contacts: includeContacts ? exportContacts : [] }),
      });
      if (!workbookResponse.ok) throw new Error("Unable to create contact workbook.");
      const blob = await workbookResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `unified-contact-master${includeContacts ? "" : "-template"}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError("Unable to create the contact Excel workbook. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const validateWorkbook = () => {
    if (!selectedFile) return;
    setValidatedImport(null);
    setSummary(null);
    setImportProgress(null);
    setFatalError("");
    startTransition(async () => {
      try {
        const parsed = await parseContactWorkbook(selectedFile);
        setValidatedImport(parsed);
      } catch (error) {
        setFatalError(error instanceof Error ? error.message : "The contact workbook could not be imported.");
      }
    });
  };

  const createValidatedContacts = () => {
    if (!validatedImport?.contacts.length) return;
    setSummary(null);
    setImportProgress({ created: 0, processed: 0, total: validatedImport.contacts.length });
    startTransition(async () => {
      const failures = [...validatedImport.failures];
      const retryableContacts: ContactWorkbookImportResult["contacts"] = [];
      let created = 0;
      let processed = 0;
      for (let index = 0; index < validatedImport.contacts.length; index += IMPORT_BATCH_SIZE) {
        const batch = validatedImport.contacts.slice(index, index + IMPORT_BATCH_SIZE);
        const results = await Promise.all(batch.map(async ({ contactKey, input }) => {
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error ?? "Unable to create contact.");
            return { contactKey, input, error: null };
          } catch (error) {
            return {
              contactKey,
              input,
              error: error instanceof Error ? error.message : "Unable to create contact.",
            };
          }
        }));
        for (const result of results) {
          if (result.error) {
            retryableContacts.push({ contactKey: result.contactKey, input: result.input });
            failures.push({ contactKey: result.contactKey, message: result.error });
          } else {
            created += 1;
          }
        }
        processed += results.length;
        setImportProgress({ created, processed, total: validatedImport.contacts.length });
      }
      setSummary({
        created,
        failureCount: failures.length,
        failures: failures.slice(0, 100),
      });
      setImportProgress(null);
      setValidatedImport({ ...validatedImport, contacts: retryableContacts });
      if (created > 0) router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void downloadWorkbook(true)}
          disabled={isGenerating}
          aria-label="Download Unified Contact Master Excel workbook"
        >
          <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
          {isGenerating ? "Preparing..." : "Download Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedFile(null);
            setValidatedImport(null);
            setSummary(null);
            setImportProgress(null);
            setFatalError("");
            setIsOpen(true);
          }}
          aria-label="Upload Unified Contact Master Excel workbook"
        >
          <Upload aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Upload Excel
        </Button>
      </div>
      {downloadError ? <p className="text-sm text-slate-700" role="alert">{downloadError}</p> : null}

      <Modal open={isOpen} onClose={() => setIsOpen(false)} ariaLabel="Import Unified Contact Master Excel workbook" size="md">
        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Import Unified Contact Master</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use the single-sheet template with one contact per row. Validate first to normalize role capitalization, spaces, hyphens, and separators; spelling is not guessed, and any role entered must match an active role code. Roles are optional and can be assigned later. Review row errors before creating contacts. Contact Codes are generated on save, and full bank account numbers are never included in exports.
              {" "}Each .xlsx file can contain up to 100,000 contact rows (50 MB maximum); add rows to the template in Excel as needed.
            </p>
          </div>
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => {
              setSelectedFile(event.currentTarget.files?.[0] ?? null);
              setValidatedImport(null);
              setSummary(null);
              setImportProgress(null);
              setFatalError("");
            }}
            aria-label="Contact Excel workbook file"
          />
          {selectedFile ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
              {selectedFile.name}
            </p>
          ) : null}
          {fatalError ? <p className="text-sm text-slate-700" role="alert">{fatalError}</p> : null}
          {importProgress ? (
            <p className="text-sm text-slate-600" role="status" aria-live="polite">
              Inserted {importProgress.created} of {importProgress.total} validated contacts
              {" "}({importProgress.processed} processed).
            </p>
          ) : null}
          {validatedImport ? (
            <div className="space-y-2 text-sm" role="status">
              <p>
                Validation found {validatedImport.contacts.length} valid contact{validatedImport.contacts.length === 1 ? "" : "s"}
                {" "}and {validatedImport.failures.length} row{validatedImport.failures.length === 1 ? "" : "s"} with errors.
              </p>
              {validatedImport.corrections.length ? (
                <div>
                  <p className="font-medium">Role values will be normalized:</p>
                  <ul className="max-h-24 list-disc space-y-1 overflow-y-auto pl-5">
                    {validatedImport.corrections.slice(0, 10).map((correction, index) => (
                      <li key={`${correction.contactKey}-${index}`}>
                        {correction.contactKey}: {correction.original} -&gt; {correction.corrected}
                      </li>
                    ))}
                  </ul>
                  {validatedImport.corrections.length > 10 ? (
                    <p>{validatedImport.corrections.length - 10} additional corrections.</p>
                  ) : null}
                </div>
              ) : null}
              {validatedImport.failures.length ? (
                <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-5" role="alert">
                  {validatedImport.failures.slice(0, 10).map((failure, index) => (
                    <li key={`${failure.contactKey}-${index}`}>{failure.contactKey}: {failure.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {summary ? (
            <div className="space-y-2 text-sm" role={summary.failures.length ? "alert" : "status"}>
              <p>Created {summary.created} contact{summary.created === 1 ? "" : "s"}; {summary.failureCount} row{summary.failureCount === 1 ? "" : "s"} failed.</p>
              {summary.failures.length ? (
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                  {summary.failures.slice(0, 10).map((failure, index) => (
                    <li key={`${failure.contactKey}-${index}`}>{failure.contactKey}: {failure.message}</li>
                  ))}
                </ul>
              ) : null}
              {summary.failureCount > 10 ? <p>{summary.failureCount - 10} additional errors are not shown.</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void downloadWorkbook(false)} disabled={isGenerating}>
              <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Download single-sheet template
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isPending}>
              Close
            </Button>
            {!validatedImport ? (
              <Button type="button" variant="primary" onClick={validateWorkbook} disabled={!selectedFile || isPending}>
                {isPending ? "Validating..." : "Validate & auto-correct"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={createValidatedContacts}
                disabled={!validatedImport.contacts.length || isPending}
              >
                {isPending ? "Creating..." : `Create ${validatedImport.contacts.length} valid contact${validatedImport.contacts.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
