"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  createContactWorkbook,
  parseContactWorkbook,
  type ContactWorkbookRecord,
} from "@/lib/master-data/contact-records-workbook";

type ContactMasterExcelActionsProps = {
  contacts: ContactWorkbookRecord[];
  endpoint: string;
};

type ImportSummary = {
  created: number;
  failures: Array<{ contactKey: string; message: string }>;
};

export default function ContactMasterExcelActions({
  contacts,
  endpoint,
}: ContactMasterExcelActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fatalError, setFatalError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const downloadWorkbook = (includeContacts: boolean) => {
    const workbookData = createContactWorkbook(includeContacts ? contacts : []);
    const blob = new Blob([workbookData], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `unified-contact-master${includeContacts ? "" : "-template"}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const importWorkbook = () => {
    if (!selectedFile) return;
    setSummary(null);
    setFatalError("");
    startTransition(async () => {
      try {
        const parsed = await parseContactWorkbook(selectedFile);
        const failures = [...parsed.failures];
        let created = 0;
        for (const { contactKey, input } of parsed.contacts) {
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error ?? "Unable to create contact.");
            created += 1;
          } catch (error) {
            failures.push({
              contactKey,
              message: error instanceof Error ? error.message : "Unable to create contact.",
            });
          }
        }
        setSummary({ created, failures: failures.slice(0, 100) });
        if (created > 0) router.refresh();
      } catch (error) {
        setFatalError(error instanceof Error ? error.message : "The contact workbook could not be imported.");
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => downloadWorkbook(true)}
          aria-label="Download Unified Contact Master Excel workbook"
        >
          <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Download Excel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedFile(null);
            setSummary(null);
            setFatalError("");
            setIsOpen(true);
          }}
          aria-label="Upload Unified Contact Master Excel workbook"
        >
          <Upload aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Upload Excel
        </Button>
      </div>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} ariaLabel="Import Unified Contact Master Excel workbook" size="md">
        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold">Import Unified Contact Master</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use the four-sheet contact workbook. Imports create new contacts only; exported contact codes are reference-only. Bank account numbers are not included in exports.
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
              setSummary(null);
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
          {summary ? (
            <div className="space-y-2 text-sm" role={summary.failures.length ? "alert" : "status"}>
              <p>Created {summary.created} contact{summary.created === 1 ? "" : "s"}; {summary.failures.length} row{summary.failures.length === 1 ? "" : "s"} failed.</p>
              {summary.failures.length ? (
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                  {summary.failures.slice(0, 10).map((failure, index) => (
                    <li key={`${failure.contactKey}-${index}`}>{failure.contactKey}: {failure.message}</li>
                  ))}
                </ul>
              ) : null}
              {summary.failures.length > 10 ? <p>{summary.failures.length - 10} additional errors are not shown.</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => downloadWorkbook(false)}>
              <Download aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Blank template
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isPending}>
              Close
            </Button>
            <Button type="button" variant="primary" onClick={importWorkbook} disabled={!selectedFile || isPending}>
              {isPending ? "Importing..." : "Import workbook"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
