export type TextCase = "uppercase" | "preserve";

export function normalizeUppercase(value: string): string {
  return value.toUpperCase();
}
