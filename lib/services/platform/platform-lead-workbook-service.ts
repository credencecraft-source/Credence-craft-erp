import XlsxPopulate from "xlsx-populate";

import { PLATFORM_LEAD_STAGES } from "./platform-lead-constants";

const LEAD_HEADERS = ["Name", "Email", "Mobile", "Company name", "City", "Source", "Stage"] as const;
const MAX_TEMPLATE_ROWS = 501;

type PlatformLeadWorkbookRow = {
  name: string;
  email: string | null;
  mobile: string | null;
  company_name: string | null;
  city: string | null;
  source: string | null;
  stage: string;
};

export async function createPlatformLeadsWorkbook(leads: PlatformLeadWorkbookRow[]) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const leadsSheet = workbook.sheet(0).name("Leads");
  const stagesSheet = workbook.addSheet("Stages");

  leadsSheet.range("A1:G1").value([[...LEAD_HEADERS]]);
  leadsSheet.range("A1:G1").style({ bold: true, fill: "E2F3EC" });
  leadsSheet.freezePanes(1, 0);
  LEAD_HEADERS.forEach((header, index) => {
    leadsSheet.column(String.fromCharCode(65 + index)).width(Math.max(header.length + 3, 18));
  });

  if (leads.length > 0) {
    leadsSheet.range(`A2:G${leads.length + 1}`).value(
      leads.map((lead) => [
        lead.name,
        lead.email ?? "",
        lead.mobile ?? "",
        lead.company_name ?? "",
        lead.city ?? "",
        lead.source ?? "",
        lead.stage,
      ]),
    );
  }

  stagesSheet.cell("A1").value("Stage");
  stagesSheet.range(`A2:A${PLATFORM_LEAD_STAGES.length + 1}`).value(
    PLATFORM_LEAD_STAGES.map((stage) => [stage]),
  );
  workbook.definedName(
    "PlatformLeadStages",
    stagesSheet.range(`A2:A${PLATFORM_LEAD_STAGES.length + 1}`),
  );
  leadsSheet.range(`G2:G${Math.max(MAX_TEMPLATE_ROWS, leads.length + 1)}`).dataValidation({
    type: "list",
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: "Choose a lead stage",
    error: "Select a stage from the dropdown list.",
    formula1: "PlatformLeadStages",
  });
  stagesSheet.hidden(true);
  stagesSheet.freezePanes(1, 0);

  return workbook.outputAsync({ type: "nodebuffer" });
}
