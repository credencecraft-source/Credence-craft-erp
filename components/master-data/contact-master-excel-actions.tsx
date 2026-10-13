"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";
import { uploadMasterWorkbookToHistory } from "@/lib/master-data/master-import-client";

type ContactMasterExcelActionsProps = {
  contacts: ContactWorkbookRecord[];
  endpoint: string;
  organizationId: string;
  workspaceId: string;
};

export default function ContactMasterExcelActions({
  contacts,
  endpoint,
  organizationId,
  workspaceId,
}: ContactMasterExcelActionsProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const historyUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration/import-history`;

  const downloadWorkbook = async (includeContacts: boolean) => {
    setError("");
    setIsGenerating(true);
    try {
      let exportContacts = contacts;
      if (includeContacts) {
        const allContacts: ContactWorkbookRecord[] = [];
        const pageSize = 200;
        for (let offset = 0; ; offset += pageSize) {
          const response = await fetch(`${endpoint}?limit=${pageSize}&offset=${offset}`, { cache: "no-store" });
          const result: unknown = await response.json();
          if (!response.ok || !Array.isArray(result)) {
            throw new Error("Unable to load contact records for export.");
          }
          allContacts.push(...result as ContactWorkbookRecord[]);
          if (result.length < pageSize) break;
        }
        exportContacts = allContacts;
      }
      const response = await fetch(`${endpoint}/workbook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contacts: includeContacts ? exportContacts : [] }),
      });
      if (!response.ok) throw new Error("Unable to create the contact workbook.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `unified-contact-master${includeContacts ? "" : "-template"}.xlsx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to create the contact workbook.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveWorkbook = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      await uploadMasterWorkbookToHistory(organizationId, "contact", selectedFile);
      setNotice("Workbook securely saved on the server. Continue staging, correcting, and importing from Import History.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to save this workbook to Import History.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void downloadWorkbook(true)}
          disabled={isGenerating}
          aria-label="Download Unified Contact Master Excel workbook"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {isGenerating ? "Preparing..." : "Download Excel"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelectedFile(null);
            setNotice("");
            setError("");
            setIsOpen(true);
          }}
          aria-label="Upload Unified Contact Master Excel workbook"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          Upload Excel
        </Button>
        {error ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
      </div>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        closeOnBackdrop={false}
        ariaLabel="Save Unified Contact Master workbook"
        size="md"
      >
        <div className="space-y-4 p-6">
          <header>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Upload Unified Contact Master</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Save the workbook to server-backed Import History. Stage and validate it there, correct only fields with errors, then explicitly start or resume the import. Uploading does not create contacts.
            </p>
          </header>
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            aria-label="Contact Excel workbook file"
          />
          {selectedFile ? (
            <p className="flex min-w-0 items-center gap-2 truncate text-sm text-[var(--erp-muted)]">
              <FileSpreadsheet aria-hidden="true" className="h-4 w-4 shrink-0" />
              {selectedFile.name}
            </p>
          ) : null}
          {notice ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-success)]" role="status">
              <span>{notice}</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => {
                setIsOpen(false);
                router.push(historyUrl);
              }}>
                Open Import History
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void downloadWorkbook(false)} disabled={isGenerating}>
              <Download aria-hidden="true" className="h-4 w-4" />
              Download template
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isSaving}>
              Close
            </Button>
            <Button type="button" onClick={() => void saveWorkbook()} disabled={!selectedFile || isSaving}>
              {isSaving ? "Saving to server..." : "Save to Import History"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
