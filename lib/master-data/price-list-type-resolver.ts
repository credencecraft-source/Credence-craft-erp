import { getMasterDefinition } from "@/lib/master-data/master-data-registry";

export function resolvePriceListType(value: string) {
  const priceListTypes = getMasterDefinition("price-list")?.fields
    .find((field) => field.key === "Channel_Type")?.options ?? [];
  const normalizedValue = value.toLocaleLowerCase();

  return priceListTypes.find((priceListType) => (
    priceListType.toLocaleLowerCase() === normalizedValue
    || encodeURIComponent(priceListType).toLocaleLowerCase() === normalizedValue
  )) ?? null;
}
