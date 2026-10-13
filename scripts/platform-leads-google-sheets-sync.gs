const PLATFORM_LEADS_SPREADSHEET_ID = "1Di1826DLE3ApY4KfnIgKxQ_YFlrmoxMn6h_ykf-oXcc";
const PLATFORM_LEADS_SHEET_NAME = "";
const PLATFORM_LEADS_MAX_ROWS = 500;

function doGet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(PLATFORM_LEADS_SPREADSHEET_ID);
    const sheet = PLATFORM_LEADS_SHEET_NAME
      ? spreadsheet.getSheetByName(PLATFORM_LEADS_SHEET_NAME)
      : spreadsheet.getSheets()[0];
    if (!sheet) return jsonResponse_({ ok: false, error: "Sheet not found" });

    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) return jsonResponse_({ ok: true, leads: [] });

    const headerIndexes = new Map();
    values[0].forEach((header, index) => {
      headerIndexes.set(normalizeHeader_(header), index);
    });

    const leads = [];
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const row = values[rowIndex];
      if (!row.some((cell) => String(cell).trim())) continue;
      if (leads.length >= PLATFORM_LEADS_MAX_ROWS) {
        return jsonResponse_({ ok: false, error: "Too many lead rows" });
      }
      leads.push({
        name: cellByHeader_(row, headerIndexes, ["name", "full name", "contact name", "contact person"]),
        email: cellByHeader_(row, headerIndexes, ["email", "email address", "e-mail"]),
        mobile: cellByHeader_(row, headerIndexes, ["mobile", "mobile number", "phone", "phone number", "whatsapp", "whatsapp number"]),
        companyName: cellByHeader_(row, headerIndexes, ["company name", "company", "business name", "organization"]),
        city: cellByHeader_(row, headerIndexes, ["city", "location"]),
        source: cellByHeader_(row, headerIndexes, ["source", "lead source"]) || "Google Sheets",
        natureOfBusiness: cellByHeader_(row, headerIndexes, ["nature of business", "business type", "requirement", "message"]),
      });
    }

    return jsonResponse_({ ok: true, leads: leads });
  } catch {
    console.error("Platform lead sheet sync failed");
    return jsonResponse_({ ok: false, error: "Unable to read the configured leads sheet" });
  }
}

function cellByHeader_(row, indexes, aliases) {
  for (const alias of aliases) {
    const index = indexes.get(normalizeHeader_(alias));
    if (index !== undefined) return String(row[index] || "").trim();
  }
  return "";
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
