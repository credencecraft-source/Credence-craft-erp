export type UploadedMasterImportJob = {
  id: string;
  moduleKey: string;
  uploadedFileName: string;
  status: string;
  totalRows: number;
};

function getErrorMessage(payload: unknown) {
  if (typeof payload === "object" && payload !== null && "error" in payload
    && typeof payload.error === "string") return payload.error;
  return "Unable to save this workbook to Import History.";
}

export async function uploadMasterWorkbookToHistory(
  organizationId: string,
  moduleKey: string,
  file: File,
): Promise<UploadedMasterImportJob> {
  const formData = new FormData();
  formData.set("moduleKey", moduleKey);
  formData.set("file", file);

  const response = await fetch(
    `/api/organizations/${encodeURIComponent(organizationId)}/master-imports`,
    { method: "POST", body: formData },
  );
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(getErrorMessage(payload));
  if (typeof payload !== "object" || payload === null || !("job" in payload)
    || typeof payload.job !== "object" || payload.job === null
    || !("id" in payload.job) || typeof payload.job.id !== "string"
    || !("moduleKey" in payload.job) || typeof payload.job.moduleKey !== "string"
    || !("uploadedFileName" in payload.job) || typeof payload.job.uploadedFileName !== "string"
    || !("status" in payload.job) || typeof payload.job.status !== "string"
    || !("totalRows" in payload.job) || typeof payload.job.totalRows !== "number") {
    throw new Error("Import History returned an invalid upload response.");
  }
  return payload.job as UploadedMasterImportJob;
}
