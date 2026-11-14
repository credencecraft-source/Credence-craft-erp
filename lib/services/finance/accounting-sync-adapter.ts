import { FinanceDocumentType, Prisma } from "@prisma/client";

type SyncLine = {
  itemCode: string | null;
  description: string;
  quantity: string;
  unitOfMeasure: string | null;
  unitRate: string;
  discountAmount: string;
  hsnCode: string | null;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  otherTaxAmount: string;
};

export type SyncableFinanceTransaction = {
  documentType: FinanceDocumentType;
  documentNumber: string;
  documentDate: string;
  currencyCode: string;
  partyName: string;
  partyGstin: string | null;
  subtotal: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  otherTaxAmount: string;
  totalAmount: string;
  lines: SyncLine[];
};

export type TallyLedgerMapping = {
  companyName: string;
  partyLedgerName: string;
  transactionLedgerName: string;
  cgstLedgerName?: string;
  sgstLedgerName?: string;
  igstLedgerName?: string;
  otherTaxLedgerName?: string;
};

export type ZohoBooksMapping = {
  partyId: string;
  itemIdByCode: Readonly<Record<string, string>>;
  taxIdByRate: Readonly<Record<string, string>>;
};

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decimal(value: string, field: string) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal amount.`);
  }
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`${field} must be a finite non-negative amount.`);
  }
  return parsed;
}

function tallyDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Finance document date is invalid.");
  return value.replaceAll("-", "");
}

function tallyVoucherType(documentType: FinanceDocumentType) {
  switch (documentType) {
    case FinanceDocumentType.SALES_INVOICE:
      return "Sales";
    case FinanceDocumentType.PURCHASE_INVOICE:
    case FinanceDocumentType.PURCHASE_BILL:
      return "Purchase";
    case FinanceDocumentType.CREDIT_NOTE:
      return "Credit Note";
    case FinanceDocumentType.DEBIT_NOTE:
      return "Debit Note";
    case FinanceDocumentType.DELIVERY_CHALLAN:
      throw new Error("Delivery challans are logistics records and are not mapped to accounting vouchers.");
  }
}

export function mapToTallyPrimeXml(
  transaction: SyncableFinanceTransaction,
  mapping: TallyLedgerMapping,
  idempotencyKey?: string,
) {
  if (!mapping.companyName.trim() || !mapping.partyLedgerName.trim() || !mapping.transactionLedgerName.trim()) {
    throw new Error("Tally company, party, and transaction ledger mappings are required.");
  }
  if (transaction.lines.length === 0) throw new Error("A Tally voucher requires at least one line.");
  if (transaction.documentType === FinanceDocumentType.DELIVERY_CHALLAN) {
    throw new Error("Delivery challans are logistics records and are not mapped to accounting vouchers.");
  }

  const partyMultiplier = transaction.documentType === FinanceDocumentType.SALES_INVOICE
    ? 1
    : transaction.documentType === FinanceDocumentType.PURCHASE_INVOICE
      || transaction.documentType === FinanceDocumentType.PURCHASE_BILL
      ? -1
      : transaction.documentType === FinanceDocumentType.CREDIT_NOTE ? -1 : 1;
  const offsetMultiplier = -partyMultiplier;
  const partyAmount = decimal(transaction.totalAmount, "Document total").mul(partyMultiplier);
  const transactionAmount = decimal(transaction.subtotal, "Document subtotal").mul(offsetMultiplier);
  const ledgerEntries = [
    { name: mapping.partyLedgerName, amount: partyAmount },
    { name: mapping.transactionLedgerName, amount: transactionAmount },
    ...(transaction.cgstAmount !== "0.00" && mapping.cgstLedgerName
      ? [{ name: mapping.cgstLedgerName, amount: decimal(transaction.cgstAmount, "CGST").mul(offsetMultiplier) }]
      : []),
    ...(transaction.sgstAmount !== "0.00" && mapping.sgstLedgerName
      ? [{ name: mapping.sgstLedgerName, amount: decimal(transaction.sgstAmount, "SGST").mul(offsetMultiplier) }]
      : []),
    ...(transaction.igstAmount !== "0.00" && mapping.igstLedgerName
      ? [{ name: mapping.igstLedgerName, amount: decimal(transaction.igstAmount, "IGST").mul(offsetMultiplier) }]
      : []),
    ...(transaction.otherTaxAmount !== "0.00" && mapping.otherTaxLedgerName
      ? [{ name: mapping.otherTaxLedgerName, amount: decimal(transaction.otherTaxAmount, "Other tax").mul(offsetMultiplier) }]
      : []),
  ];
  const mappedTaxAmounts = ledgerEntries.slice(2).reduce(
    (total, entry) => total.plus(entry.amount.abs()),
    new Prisma.Decimal(0),
  );
  const documentTax = decimal(transaction.cgstAmount, "CGST")
    .plus(decimal(transaction.sgstAmount, "SGST"))
    .plus(decimal(transaction.igstAmount, "IGST"))
    .plus(decimal(transaction.otherTaxAmount, "Other tax"));
  if (!mappedTaxAmounts.eq(documentTax)) {
    throw new Error("Tally tax ledger mappings are incomplete for this document.");
  }
  if (!partyAmount.plus(transactionAmount).plus(ledgerEntries.slice(2).reduce(
    (total, entry) => total.plus(entry.amount),
    new Prisma.Decimal(0),
  )).isZero()) {
    throw new Error("Tally ledger mapping does not balance to the central transaction total.");
  }

  const ledgerXml = ledgerEntries.map((entry) => `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${xml(entry.name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${entry.amount.isNegative() ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <AMOUNT>${entry.amount.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join("");
  const inventoryMultiplier = transaction.documentType === FinanceDocumentType.SALES_INVOICE
    || transaction.documentType === FinanceDocumentType.DEBIT_NOTE
    ? -1
    : 1;
  const inventoryXml = transaction.lines.map((line) => {
    const inventoryAmount = decimal(line.taxableAmount, "Line taxable amount").mul(inventoryMultiplier);
    return `
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${xml(line.description)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>${inventoryAmount.isNegative() ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
          <RATE>${xml(line.unitRate)}/${xml(line.unitOfMeasure ?? "PCS")}</RATE>
          <ACTUALQTY>${xml(line.quantity)} ${xml(line.unitOfMeasure ?? "PCS")}</ACTUALQTY>
          <BILLEDQTY>${xml(line.quantity)} ${xml(line.unitOfMeasure ?? "PCS")}</BILLEDQTY>
          <AMOUNT>${inventoryAmount.toFixed(2)}</AMOUNT>
          ${line.hsnCode ? `<GSTHSNNAME>${xml(line.hsnCode)}</GSTHSNNAME>` : ""}
        </ALLINVENTORYENTRIES.LIST>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY><IMPORTDATA>
    <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(mapping.companyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
    <REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="${xml(tallyVoucherType(transaction.documentType))}" ACTION="Create" OBJVIEW="Invoice Voucher View">
        <DATE>${tallyDate(transaction.documentDate)}</DATE>
        <VOUCHERNUMBER>${xml(transaction.documentNumber)}</VOUCHERNUMBER>
        ${idempotencyKey ? `<REMOTEID>${xml(idempotencyKey)}</REMOTEID>` : ""}
        <PARTYLEDGERNAME>${xml(mapping.partyLedgerName)}</PARTYLEDGERNAME>
        <REFERENCE>${xml(transaction.documentNumber)}</REFERENCE>
        <GSTREGISTRATIONTYPE>${transaction.partyGstin ? "Regular" : "Unregistered"}</GSTREGISTRATIONTYPE>
        ${ledgerXml}
        ${inventoryXml}
      </VOUCHER>
    </TALLYMESSAGE></REQUESTDATA>
  </IMPORTDATA></BODY>
</ENVELOPE>`;
}

export function mapToZohoBooksPayload(
  transaction: SyncableFinanceTransaction,
  mapping: ZohoBooksMapping,
) {
  if (transaction.documentType === FinanceDocumentType.DELIVERY_CHALLAN) {
    throw new Error("Delivery challans are logistics records and are not mapped to Zoho Books financial documents.");
  }
  if (!mapping.partyId.trim()) throw new Error("A Zoho Books customer or vendor ID mapping is required.");
  if (transaction.lines.length === 0) throw new Error("A Zoho Books document requires at least one line.");
  const lineItems = transaction.lines.map((line) => {
    const itemId = line.itemCode ? mapping.itemIdByCode[line.itemCode] : null;
    const taxId = mapping.taxIdByRate[line.gstRate];
    if (!itemId || !taxId) {
      throw new Error(`Zoho Books item and tax mappings are required for line ${line.itemCode ?? line.description}.`);
    }
    return {
      item_id: itemId,
      name: line.description,
      quantity: line.quantity,
      rate: line.unitRate,
      discount: line.discountAmount === "0.00" ? undefined : line.discountAmount,
      hsn_or_sac: line.hsnCode ?? undefined,
      tax_id: taxId,
    };
  });
  const common = {
    date: transaction.documentDate,
    reference_number: transaction.documentNumber,
    currency_code: transaction.currencyCode,
    line_items: lineItems,
  };
  switch (transaction.documentType) {
    case FinanceDocumentType.SALES_INVOICE:
      return { customer_id: mapping.partyId, ...common };
    case FinanceDocumentType.PURCHASE_INVOICE:
    case FinanceDocumentType.PURCHASE_BILL:
      return { vendor_id: mapping.partyId, bill_number: transaction.documentNumber, ...common };
    case FinanceDocumentType.CREDIT_NOTE:
      return { customer_id: mapping.partyId, creditnote_number: transaction.documentNumber, ...common };
    case FinanceDocumentType.DEBIT_NOTE:
      return { vendor_id: mapping.partyId, vendor_credit_number: transaction.documentNumber, ...common };
  }
}
