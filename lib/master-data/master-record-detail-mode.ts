export type MasterRecordDetailMode = "view" | "edit";

export function getMasterRecordDetailMode(mode: string | string[] | undefined): MasterRecordDetailMode {
  const requestedMode = Array.isArray(mode) ? mode[0] : mode;
  return requestedMode === "edit" ? "edit" : "view";
}
