import type { OrderFormState } from "./order-form-types";

type RequiredOrderFields = Pick<
  OrderFormState,
  | "article"
  | "buyer"
  | "brand"
  | "category"
  | "colors"
  | "deliveryDate"
  | "entityName"
  | "haveSizeRatio"
  | "ratioOrderQty"
  | "season"
  | "sizeGroup"
  | "styleName"
  | "subCategory"
>;

export function getMissingRequiredOrderField(
  form: RequiredOrderFields,
  orderSourceStatus: string,
) {
  const requiredFields: Array<[string, unknown]> = [
    ["Buyer", form.buyer],
    ["Brand", form.brand],
    ...(orderSourceStatus === "ARTICLE_BASED" ? [["Article", form.article] as [string, unknown]] : []),
    ["Delivery Date", form.deliveryDate],
    ["Entity Name", form.entityName],
    ["Product Category", form.category],
    ["Product Sub Category", form.subCategory],
    ["Style Name", form.styleName],
    ["Colors", form.colors],
    ["Season", form.season],
    ["Size Group", form.sizeGroup],
    ...(form.haveSizeRatio ? [["Ratio Order Qty", form.ratioOrderQty] as [string, unknown]] : []),
  ];

  return requiredFields.find(([, value]) => !String(value ?? "").trim())?.[0] ?? null;
}
