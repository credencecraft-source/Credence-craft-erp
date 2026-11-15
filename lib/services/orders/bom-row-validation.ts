export type BomMaterialIdentityInput = {
  rawMaterialName?: string | null;
};

function normalizeIdentityPart(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function getBomMaterialIdentity(row: BomMaterialIdentityInput) {
  const materialName = normalizeIdentityPart(row.rawMaterialName);
  if (!materialName) return null;

  return materialName;
}

export function findDuplicateBomMaterialNames(rows: BomMaterialIdentityInput[]) {
  const namesByIdentity = new Map<string, { name: string; count: number }>();

  for (const row of rows) {
    const identity = getBomMaterialIdentity(row);
    if (!identity) continue;

    const existing = namesByIdentity.get(identity);
    if (existing) {
      existing.count += 1;
    } else {
      namesByIdentity.set(identity, { name: String(row.rawMaterialName).trim(), count: 1 });
    }
  }

  return [...namesByIdentity.values()]
    .filter((item) => item.count > 1)
    .map((item) => item.name);
}