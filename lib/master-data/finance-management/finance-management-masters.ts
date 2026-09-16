import { createMaster, text } from "@/lib/master-data/master-data-models";

export const FINANCE_MANAGEMENT_MASTER_DEFINITIONS = [
  createMaster("sales-invoice", "Sales Invoice", "Sales invoice master fields and reference labels.", [
    text("Invoice_Number", "Invoice Number", { required: true, unique: true }),
    text("Customer_Name", "Customer Name", { required: true }),
  ], { moduleGroup: "finance-management", moduleSubGroup: "transactions", moduleOrder: 1, hidden: true }),
  createMaster("purchase-invoice", "Purchase Invoice", "Purchase invoice master fields and reference labels.", [
    text("Invoice_Number", "Invoice Number", { required: true, unique: true }),
    text("Vendor_Name", "Vendor Name", { required: true }),
  ], { moduleGroup: "finance-management", moduleSubGroup: "transactions", moduleOrder: 2, hidden: true }),
  createMaster("debit-note", "Debit Note", "Debit note master fields and reference labels.", [
    text("Debit_Note_Number", "Debit Note Number", { required: true, unique: true }),
  ], { moduleGroup: "finance-management", moduleSubGroup: "transactions", moduleOrder: 3, hidden: true }),
  createMaster("credit-note", "Credit Note", "Credit note master fields and reference labels.", [
    text("Credit_Note_Number", "Credit Note Number", { required: true, unique: true }),
  ], { moduleGroup: "finance-management", moduleSubGroup: "transactions", moduleOrder: 4, hidden: true }),
  createMaster("delivery-challan", "Delivery Challan", "Delivery challan master fields and reference labels.", [
    text("Challan_Number", "Challan Number", { required: true, unique: true }),
  ], { moduleGroup: "finance-management", moduleSubGroup: "transactions", moduleOrder: 5, hidden: true }),
];
