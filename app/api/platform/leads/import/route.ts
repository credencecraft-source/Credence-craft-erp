import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { importPlatformLeads, type PlatformLeadInput } from "@/lib/services/platform/platform-lead-service";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const REQUIRED_HEADERS = ["name", "email", "mobile", "company name", "city", "source", "stage"] as const;

function cellText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseLeadWorkbook(buffer: ArrayBuffer): PlatformLeadInput[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: false });
  } catch {
    throw new Error("Unable to read workbook. Upload a valid .xlsx or .xls file.");
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new Error("The workbook is empty.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  if (rows.length === 0 || !Array.isArray(rows[0])) {
    throw new Error("The workbook must include the Leads header row.");
  }

  const headerIndexes = new Map<string, number>();
  rows[0].forEach((header, index) => {
    const key = cellText(header).toLowerCase();
    if (key) headerIndexes.set(key, index);
  });
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing workbook columns: ${missingHeaders.join(", ")}.`);
  }

  const dataRows = rows.slice(1).filter((row) =>
    Array.isArray(row) && row.some((cell) => cellText(cell) !== ""),
  );
  if (dataRows.length === 0) throw new Error("The workbook does not contain any lead rows.");
  if (dataRows.length > MAX_ROWS) throw new Error(`Import up to ${MAX_ROWS} leads at a time.`);

  const get = (row: unknown[], header: (typeof REQUIRED_HEADERS)[number]) =>
    cellText(row[headerIndexes.get(header)!]);
  const getOptional = (row: unknown[], header: string) => {
    const index = headerIndexes.get(header);
    return index === undefined ? "" : cellText(row[index]);
  };

  return dataRows.map((row) => ({
    name: get(row, "name"),
    email: get(row, "email"),
    mobile: get(row, "mobile"),
    companyName: get(row, "company name"),
    natureOfBusiness: getOptional(row, "nature of business"),
    city: get(row, "city"),
    source: get(row, "source"),
    stage: get(row, "stage"),
  }));
}

export async function POST(request: Request) {
  try {
    await requirePlatformSessionAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a lead workbook to upload.");
    if (file.size === 0) throw new Error("The selected workbook is empty.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Upload a workbook smaller than 5 MB.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Upload an .xlsx or .xls workbook.");

    const imported = await importPlatformLeads(parseLeadWorkbook(await file.arrayBuffer()));
    return NextResponse.json({ imported: imported.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import leads." },
      { status: 400 },
    );
  }
}
