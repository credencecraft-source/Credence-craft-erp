import { describe, expect, it } from "vitest";

import {
  buildContactSavePayload,
  emptyContactForm,
  mergeContactSaveResponse,
  toContactForm,
  type ContactData,
} from "./contact-master-form";

const contact: ContactData = {
  id: "contact-1",
  code: "CT1",
  legal_name: "CONTACT NAME",
  display_name: "CONTACT DISPLAY",
  email: "contact@example.test",
  phone: "1234567890",
  is_active: true,
  roles: [{ role_code: "CUSTOMER" }],
  tax_registrations: [],
  addresses: [],
  bank_accounts: [],
};

describe("contact master form payload", () => {
  it("omits unchanged relationship sections from an update", () => {
    const original = toContactForm(contact);
    const changed = { ...original, displayName: "UPDATED DISPLAY" };

    expect(buildContactSavePayload(changed, original)).toEqual({
      displayName: "UPDATED DISPLAY",
    });
  });

  it("omits every unchanged field from an update", () => {
    const original = toContactForm(contact);

    expect(buildContactSavePayload(original, original)).toEqual({});
  });

  it("merges compact scalar save responses without dropping linked contact data", () => {
    expect(mergeContactSaveResponse(contact, {
      id: contact.id,
      phone: "9990000000",
    })).toEqual({ ...contact, phone: "9990000000" });
  });

  it("sends a complete create payload", () => {
    const form = { ...emptyContactForm(), legalName: "NEW CONTACT" };

    expect(buildContactSavePayload(form)).toEqual({
      legalName: "NEW CONTACT",
      displayName: null,
      email: null,
      phone: null,
      isActive: true,
      roles: [],
      taxRegistrations: [],
      addresses: [],
      bankAccounts: [],
    });
  });

  it("sends changed bank account values without masked data", () => {
    const original = toContactForm({
      ...contact,
      bank_accounts: [{
        id: "bank-1",
        account_holder_name: "CONTACT NAME",
        account_number_masked: "•••• 1234",
        ifsc_code: "ABCD0001234",
        bank_name: "BANK",
        branch: null,
        is_default: true,
      }],
    });
    const changed = {
      ...original,
      bankAccounts: [{ ...original.bankAccounts[0], accountHolderName: "UPDATED NAME" }],
    };

    expect(buildContactSavePayload(changed, original)).toEqual({
      bankAccounts: [{
        id: "bank-1",
        accountHolderName: "UPDATED NAME",
        accountNumber: "",
        ifscCode: "ABCD0001234",
        bankName: "BANK",
        branch: "",
        isDefault: true,
      }],
    });
  });
});
