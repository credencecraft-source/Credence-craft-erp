export function requiresDummyDataCleanup(status?: string | boolean | null): boolean {
  if (typeof status === "boolean") {
    return status;
  }
  return status === "ACTIVE" || status === "DELETING";
}
