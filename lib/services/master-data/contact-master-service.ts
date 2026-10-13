import {
  ContactAddressUsage,
  ContactTaxRegistrationStatus,
  ContactTaxRegistrationType,
  Prisma,
} from "@prisma/client";

import { encryptSecret } from "@/lib/auth/secret-cryptography";
import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

import {
  ContactValidationError,
  normalizeAndValidateGstin,
  parseContactInput,
  type ContactInput,
} from "./contact-master-validation";

type ContactDatabase = typeof prisma;
type ContactTransaction = Prisma.TransactionClient;

function publicContact<T extends {
  bank_accounts?: Array<{ id: string; account_number_last4: string; [key: string]: unknown }>;
}>(contact: T) {
  const { bank_accounts, ...safeContact } = contact;
  return {
    ...safeContact,
    bank_accounts: bank_accounts?.map(({ account_number_last4, ...account }) => ({
      ...account,
      account_number_masked: `•••• ${account_number_last4}`,
    })),
  };
}

function buildContactData(input: Partial<ContactInput>) {
  return {
    ...(input.code !== undefined ? { code: input.code } : {}),
    ...(input.legalName !== undefined ? { legal_name: input.legalName } : {}),
    ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
}

async function syncContactRoleProjections(
  tx: ContactTransaction,
  organizationId: string,
  contactId: string,
) {
  const contact = await tx.contact.findFirst({
    where: { organization_id: organizationId, id: contactId },
    select: {
      id: true,
      legal_name: true,
      display_name: true,
      email: true,
      is_active: true,
      roles: { where: { is_active: true }, select: { role_code: true } },
      tax_registrations: {
        where: { status: ContactTaxRegistrationStatus.ACTIVE },
        select: { gstin: true },
        orderBy: { created_at: "asc" },
        take: 1,
      },
    },
  });
  if (!contact) throw new Error("Contact could not be loaded while synchronizing role lookups.");

  const activeRoles = new Set(contact.roles.map((role) => role.role_code));
  const displayName = contact.display_name || contact.legal_name;
  const vendor = await tx.masterVendor.findFirst({
    where: { organization_id: organizationId, contact_id: contact.id },
    select: { id: true },
  });
  const isVendor = contact.is_active && activeRoles.has("VENDOR");
  if (vendor) {
    await tx.masterVendor.updateMany({
      where: { organization_id: organizationId, id: vendor.id },
      data: {
        vendor: displayName,
        gst_number: contact.tax_registrations[0]?.gstin ?? null,
        is_active: isVendor,
      },
    });
  } else if (isVendor) {
    await tx.masterVendor.create({
      data: {
        organization_id: organizationId,
        contact_id: contact.id,
        vendor: displayName,
        gst_number: contact.tax_registrations[0]?.gstin ?? null,
        is_active: true,
        sort_order: await tx.masterVendor.count({ where: { organization_id: organizationId } }),
      },
    });
  }

  const buyer = await tx.masterBuyer.findFirst({
    where: { organization_id: organizationId, contact_id: contact.id },
    select: { id: true },
  });
  const isSalesCounterparty = contact.is_active &&
    (activeRoles.has("CUSTOMER") || activeRoles.has("DEALER") || activeRoles.has("DISTRIBUTOR"));
  if (buyer) {
    await tx.masterBuyer.updateMany({
      where: { organization_id: organizationId, id: buyer.id },
      data: {
        buyer_name: displayName,
        buyer_email: contact.email,
        is_active: isSalesCounterparty,
      },
    });
  } else if (isSalesCounterparty) {
    await tx.masterBuyer.create({
      data: {
        organization_id: organizationId,
        contact_id: contact.id,
        buyer_name: displayName,
        buyer_email: contact.email,
        is_active: true,
        sort_order: await tx.masterBuyer.count({ where: { organization_id: organizationId } }),
      },
    });
  }
}

async function saveDetails(
  tx: ContactTransaction,
  organizationId: string,
  contactId: string,
  input: Partial<ContactInput>,
  partial: boolean,
) {
  if (input.roles !== undefined) {
    const roles = input.roles.length
      ? await tx.contactRoleDefinition.findMany({
        where: { code: { in: input.roles }, is_active: true },
        select: { code: true },
      })
      : [];
    if (roles.length !== input.roles.length) {
      throw new ContactValidationError("One or more selected contact roles are not available.");
    }
    const currentAssignments = await tx.contactRoleAssignment.findMany({
      where: { organization_id: organizationId, contact_id: contactId },
      select: { role_code: true, is_active: true },
    });
    const currentRoleCodes = new Set(currentAssignments.map((assignment) => assignment.role_code));
    const requestedRoleCodes = new Set(input.roles);
    for (const assignment of currentAssignments) {
      if (requestedRoleCodes.has(assignment.role_code)) {
        if (!assignment.is_active) {
          await tx.contactRoleAssignment.updateMany({
            where: { organization_id: organizationId, contact_id: contactId, role_code: assignment.role_code },
            data: { is_active: true },
          });
        }
        continue;
      }
      const [purchaseOrderCount, salesOrderCount] = await Promise.all([
        tx.purchaseOrder.count({
          where: { organization_id: organizationId, contact_id: contactId, counterparty_role_code: assignment.role_code },
        }),
        tx.merchandisingOrder.count({
          where: { organization_id: organizationId, contact_id: contactId, counterparty_role_code: assignment.role_code },
        }),
      ]);
      if (purchaseOrderCount > 0 || salesOrderCount > 0) {
        await tx.contactRoleAssignment.updateMany({
          where: { organization_id: organizationId, contact_id: contactId, role_code: assignment.role_code },
          data: { is_active: false },
        });
      } else {
        await tx.contactRoleAssignment.deleteMany({
          where: { organization_id: organizationId, contact_id: contactId, role_code: assignment.role_code },
        });
      }
    }
    const newRoles = input.roles.filter((roleCode) => !currentRoleCodes.has(roleCode));
    if (newRoles.length) {
      await tx.contactRoleAssignment.createMany({
        data: newRoles.map((roleCode) => ({ organization_id: organizationId, contact_id: contactId, role_code: roleCode })),
      });
    }
  }

  if (input.taxRegistrations !== undefined || input.addresses !== undefined) {
    const current = await tx.contactTaxRegistration.findMany({
      where: { organization_id: organizationId, contact_id: contactId },
    });
    const currentByGstin = new Map(current.map((registration) => [registration.gstin, registration]));
    const requestedRegistrations = input.taxRegistrations
      ?? current.map((registration) => ({
        gstin: registration.gstin,
        legalName: registration.legal_name,
        registrationType: registration.registration_type,
        status: registration.status,
      }));
    const registrationsByGstin = new Map<string, string>();
    for (const registration of requestedRegistrations) {
      const { stateCode } = normalizeAndValidateGstin(registration.gstin);
      const existing = currentByGstin.get(registration.gstin);
      let saved;
      if (existing) {
        await tx.contactTaxRegistration.updateMany({
          where: { organization_id: organizationId, contact_id: contactId, id: existing.id },
          data: {
            legal_name: registration.legalName,
            registration_type: registration.registrationType as ContactTaxRegistrationType,
            status: registration.status as ContactTaxRegistrationStatus,
          },
        });
        saved = await tx.contactTaxRegistration.findFirstOrThrow({
          where: { organization_id: organizationId, contact_id: contactId, id: existing.id },
        });
      } else {
        saved = await tx.contactTaxRegistration.create({
          data: {
            organization_id: organizationId,
            contact_id: contactId,
            gstin: registration.gstin,
            state_code: stateCode,
            legal_name: registration.legalName,
            registration_type: registration.registrationType as ContactTaxRegistrationType,
            status: registration.status as ContactTaxRegistrationStatus,
          },
        });
      }
      registrationsByGstin.set(saved.gstin, saved.id);
    }

    if (input.addresses !== undefined) {
      const currentAddresses = await tx.contactAddress.findMany({
        where: { organization_id: organizationId, contact_id: contactId },
      });
      const currentAddressIds = new Set(currentAddresses.map((address) => address.id));
      const retainedAddressIds: string[] = [];
      await tx.contactAddress.updateMany({
        where: { organization_id: organizationId, contact_id: contactId },
        data: { is_default_billing: false, is_default_shipping: false },
      });
      for (const address of input.addresses) {
        if (address.id && !currentAddressIds.has(address.id)) {
          throw new ContactValidationError("Address does not belong to this contact.");
        }
        const registrationId = address.taxRegistrationGstin
          ? registrationsByGstin.get(address.taxRegistrationGstin)
          : undefined;
        if (address.taxRegistrationGstin && !registrationId) {
          throw new ContactValidationError("Address GSTIN must belong to a tax registration assigned to this contact.");
        }
        const registration = address.taxRegistrationGstin
          ? requestedRegistrations.find((item) => item.gstin === address.taxRegistrationGstin)
          : undefined;
        if (registration && registration.status !== "ACTIVE") {
          throw new ContactValidationError("An address cannot use a suspended or cancelled GST registration.");
        }
        if (address.countryCode === "IN" && registration) {
          const registrationState = normalizeAndValidateGstin(registration.gstin).stateCode;
          if (address.stateCode !== registrationState) {
            throw new ContactValidationError("Address state code must match the linked GSTIN state code.");
          }
        }
        const data = {
          tax_registration_id: registrationId ?? null,
          label: address.label ?? null,
          usage: address.usage as ContactAddressUsage,
          address_line_1: address.addressLine1,
          address_line_2: address.addressLine2 ?? null,
          city: address.city,
          state_name: address.stateName,
          state_code: address.stateCode ?? null,
          postal_code: address.postalCode,
          country_code: address.countryCode,
          is_default_billing: address.isDefaultBilling,
          is_default_shipping: address.isDefaultShipping,
          is_active: true,
        };
        if (address.id) {
          const updated = await tx.contactAddress.updateMany({
            where: { organization_id: organizationId, contact_id: contactId, id: address.id },
            data,
          });
          if (updated.count !== 1) throw new ContactValidationError("Address changed while this contact was being saved. Refresh and retry.");
          retainedAddressIds.push(address.id);
        } else {
          const created = await tx.contactAddress.create({
            data: {
              organization_id: organizationId,
              contact_id: contactId,
              ...data,
            },
          });
          retainedAddressIds.push(created.id);
        }
      }
      const removedAddressIds = currentAddresses
        .filter((address) => !retainedAddressIds.includes(address.id))
        .map((address) => address.id);
      if (removedAddressIds.length) {
        await tx.contactAddress.updateMany({
          where: { organization_id: organizationId, contact_id: contactId, id: { in: removedAddressIds } },
          data: { is_active: false, is_default_billing: false, is_default_shipping: false },
        });
      }
    }

    if (input.taxRegistrations !== undefined) {
      const requested = new Set(requestedRegistrations.map((registration) => registration.gstin));
      const removed = current.filter((registration) => !requested.has(registration.gstin));
      if (removed.length) {
        await tx.contactTaxRegistration.updateMany({
          where: { organization_id: organizationId, contact_id: contactId, id: { in: removed.map((item) => item.id) } },
          data: { status: ContactTaxRegistrationStatus.CANCELLED },
        });
        await tx.contactAddress.updateMany({
          where: {
            organization_id: organizationId,
            contact_id: contactId,
            tax_registration_id: { in: removed.map((item) => item.id) },
          },
          data: { is_active: false, is_default_billing: false, is_default_shipping: false },
        });
      }
    }
  }

  if (input.bankAccounts !== undefined) {
    await tx.contactBankAccount.updateMany({
      where: { organization_id: organizationId, contact_id: contactId, is_default: true },
      data: { is_default: false },
    });
    const currentAccounts = await tx.contactBankAccount.findMany({
      where: { organization_id: organizationId, contact_id: contactId },
    });
    const currentById = new Map(currentAccounts.map((account) => [account.id, account]));
    const retainedIds: string[] = [];
    for (const account of input.bankAccounts) {
      const existing = account.id ? currentById.get(account.id) : undefined;
      if (account.id && !existing) throw new ContactValidationError("Bank account does not belong to this contact.");
      const data = {
        account_holder_name: account.accountHolderName,
        ifsc_code: account.ifscCode,
        bank_name: account.bankName,
        branch: account.branch ?? null,
        is_default: account.isDefault,
        ...(account.accountNumber ? {
          account_number_encrypted: encryptSecret(account.accountNumber),
          account_number_last4: account.accountNumber.slice(-4),
        } : {}),
      };
      let savedId: string;
      if (existing) {
        const updated = await tx.contactBankAccount.updateMany({
          where: { organization_id: organizationId, contact_id: contactId, id: existing.id },
          data,
        });
        if (updated.count !== 1) throw new ContactValidationError("Bank account changed while this contact was being saved. Refresh and retry.");
        savedId = existing.id;
      } else {
        const saved = await tx.contactBankAccount.create({
          data: {
            organization_id: organizationId,
            contact_id: contactId,
            account_number_encrypted: encryptSecret(account.accountNumber ?? ""),
            account_number_last4: account.accountNumber?.slice(-4) ?? "",
            ...data,
          },
        });
        savedId = saved.id;
      }
      retainedIds.push(savedId);
    }
    await tx.contactBankAccount.updateMany({
      where: {
        organization_id: organizationId,
        contact_id: contactId,
        is_active: true,
        ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}),
      },
      data: { is_active: false, is_default: false },
    });
  } else if (!partial) {
    await tx.contactBankAccount.updateMany({
      where: { organization_id: organizationId, contact_id: contactId, is_active: true },
      data: { is_active: false, is_default: false },
    });
  }
}

const contactSelect = {
  id: true,
  code: true,
  legal_name: true,
  display_name: true,
  email: true,
  phone: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  roles: { where: { is_active: true }, select: { role_code: true }, orderBy: { role_code: "asc" as const } },
  tax_registrations: {
    orderBy: { gstin: "asc" as const },
    select: { id: true, gstin: true, state_code: true, legal_name: true, registration_type: true, status: true, verified_at: true },
  },
  addresses: {
    where: { is_active: true },
    orderBy: { created_at: "asc" as const },
    select: {
      id: true, tax_registration_id: true, tax_registration: { select: { gstin: true } }, label: true, usage: true,
      address_line_1: true, address_line_2: true, city: true, state_name: true,
      state_code: true, postal_code: true, country_code: true,
      is_default_billing: true, is_default_shipping: true,
    },
  },
  bank_accounts: {
    where: { is_active: true },
    orderBy: { created_at: "asc" as const },
    select: {
      id: true, account_holder_name: true, account_number_last4: true,
      ifsc_code: true, bank_name: true, branch: true, is_default: true, is_active: true,
    },
  },
};

export async function listContacts(
  organizationId: string,
  search?: string,
  database: ContactDatabase = prisma,
  pagination: { skip?: number; take?: number } = {},
) {
  const cleanSearch = search?.trim().slice(0, 100);
  const contacts = await database.contact.findMany({
    where: {
      organization_id: organizationId,
      ...(cleanSearch ? {
        OR: [
          { code: { contains: cleanSearch, mode: "insensitive" } },
          { legal_name: { contains: cleanSearch, mode: "insensitive" } },
          { display_name: { contains: cleanSearch, mode: "insensitive" } },
          { tax_registrations: { some: { gstin: { contains: cleanSearch.toUpperCase() } } } },
        ],
      } : {}),
    },
    select: contactSelect,
    orderBy: [{ legal_name: "asc" }, { id: "asc" }],
    skip: pagination.skip ?? 0,
    take: Math.min(Math.max(pagination.take ?? 200, 1), 200),
  });
  return contacts.map(publicContact);
}

export async function getContact(organizationId: string, contactId: string, database: ContactDatabase = prisma) {
  const contact = await database.contact.findFirst({
    where: { organization_id: organizationId, id: contactId },
    select: contactSelect,
  });
  return contact ? publicContact(contact) : null;
}

async function createContactInTransaction(
  organizationId: string,
  actorId: string,
  value: unknown,
  tx: ContactTransaction,
) {
  const input = parseContactInput(value) as ContactInput;
  const counter = await tx.contactCodeCounter.upsert({
    where: { organization_id: organizationId },
    create: { organization_id: organizationId, current_value: 1 },
    update: { current_value: { increment: 1 } },
    select: { current_value: true },
  });
  const code = `CT${counter.current_value}`;
  const contact = await tx.contact.create({
    data: {
      organization_id: organizationId,
      ...buildContactData(input),
      code,
      legal_name: input.legalName,
    },
    select: { id: true },
  });
  await saveDetails(tx, organizationId, contact.id, input, false);
  await createAuditEvent({
    organizationId,
    userId: actorId,
    module: "MASTER_DATA",
    action: "CONTACT_CREATED",
    entityType: "Contact",
    entityId: contact.id,
    details: { code, roles: input.roles },
  }, tx);
  const saved = await tx.contact.findFirst({
    where: { organization_id: organizationId, id: contact.id },
    select: contactSelect,
  });
  if (!saved) throw new Error("Created contact could not be loaded.");
  await syncContactRoleProjections(tx, organizationId, contact.id);
  return publicContact(saved);
}

export async function createContact(
  organizationId: string,
  actorId: string,
  value: unknown,
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  if ("$transaction" in database) {
    return database.$transaction((tx) =>
      createContactInTransaction(organizationId, actorId, value, tx));
  }
  return createContactInTransaction(organizationId, actorId, value, database);
}

export async function updateContact(
  organizationId: string,
  actorId: string,
  contactId: string,
  value: unknown,
  database: ContactDatabase = prisma,
) {
  const input = parseContactInput(value, true);
  return database.$transaction(async (tx) => {
    const current = await tx.contact.findFirst({
      where: { organization_id: organizationId, id: contactId },
      select: { id: true },
    });
    if (!current) return null;
    await tx.contact.updateMany({
      where: { organization_id: organizationId, id: current.id },
      data: buildContactData(input),
    });
    await saveDetails(tx, organizationId, contactId, input, true);
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "MASTER_DATA",
      action: "CONTACT_UPDATED",
      entityType: "Contact",
      entityId: contactId,
      details: {
        changedSections: Object.keys(input).filter((key) => key !== "bankAccounts"),
        bankAccountCount: input.bankAccounts?.length,
      },
    }, tx);
    const saved = await tx.contact.findFirst({
      where: { organization_id: organizationId, id: contactId },
      select: contactSelect,
    });
    if (!saved) throw new Error("Updated contact could not be loaded.");
    await syncContactRoleProjections(tx, organizationId, contactId);
    return publicContact(saved);
  });
}

async function deactivateContactRecord(
  tx: ContactTransaction,
  organizationId: string,
  actorId: string,
  contact: { id: string; code: string; is_active: boolean },
) {
  if (!contact.is_active) return false;
  await tx.contact.updateMany({
    where: { organization_id: organizationId, id: contact.id },
    data: { is_active: false },
  });
  await tx.contactRoleAssignment.updateMany({
    where: { organization_id: organizationId, contact_id: contact.id },
    data: { is_active: false },
  });
  await syncContactRoleProjections(tx, organizationId, contact.id);
  await createAuditEvent({
    organizationId,
    userId: actorId,
    module: "MASTER_DATA",
    action: "CONTACT_DEACTIVATED",
    entityType: "Contact",
    entityId: contact.id,
    details: { code: contact.code },
  }, tx);
  return true;
}

export async function deactivateContact(
  organizationId: string,
  actorId: string,
  contactId: string,
  database: ContactDatabase = prisma,
) {
  return database.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { organization_id: organizationId, id: contactId },
      select: { id: true, code: true, is_active: true },
    });
    if (!contact) return null;
    return { deactivated: await deactivateContactRecord(tx, organizationId, actorId, contact) };
  });
}

export async function deactivateContacts(
  organizationId: string,
  actorId: string,
  value: unknown,
  database: ContactDatabase = prisma,
) {
  const contactIds = parseContactIds(value);

  return database.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany({
      where: { organization_id: organizationId, id: { in: contactIds } },
      select: { id: true, code: true, is_active: true },
    });
    if (contacts.length !== contactIds.length) return null;

    let deactivatedCount = 0;
    for (const contact of contacts) {
      if (await deactivateContactRecord(tx, organizationId, actorId, contact)) deactivatedCount += 1;
    }
    return { deactivatedCount };
  });
}

function parseContactIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ContactValidationError("Select between 1 and 100 unique valid contacts.");
  }
  const contactIds: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || id.trim() !== id || id.length === 0 || id.length > 200) {
      throw new ContactValidationError("Select between 1 and 100 unique valid contacts.");
    }
    contactIds.push(id);
  }
  if (new Set(contactIds).size !== contactIds.length) {
    throw new ContactValidationError("Select between 1 and 100 unique valid contacts.");
  }
  return contactIds;
}

export async function deleteUnusedContacts(
  organizationId: string,
  actorId: string,
  value: unknown,
  database: ContactDatabase = prisma,
) {
  const contactIds = parseContactIds(value);

  return database.$transaction(async (tx) => {
    const contacts = await tx.contact.findMany({
      where: { organization_id: organizationId, id: { in: contactIds } },
      select: { id: true, code: true },
    });
    if (contacts.length !== contactIds.length) return null;

    const [purchaseOrders, salesOrders, vendors] = await Promise.all([
      tx.purchaseOrder.findMany({
        where: { organization_id: organizationId, contact_id: { in: contactIds } },
        select: { contact_id: true },
        distinct: ["contact_id"],
      }),
      tx.merchandisingOrder.findMany({
        where: { organization_id: organizationId, contact_id: { in: contactIds } },
        select: { contact_id: true },
        distinct: ["contact_id"],
      }),
      tx.masterVendor.findMany({
        where: { organization_id: organizationId, contact_id: { in: contactIds } },
        select: {
          id: true,
          contact_id: true,
          _count: {
            select: {
              groupedPurchaseOrders: true,
              masterPurchaseOrders: true,
              purchaseOrders: true,
              rawMaterialStockBookings: true,
              generalPurchaseOrderRequests: true,
              distributionQuotations: true,
            },
          },
        },
      }),
    ]);

    const usedContactIds = new Set<string>();
    for (const order of [...purchaseOrders, ...salesOrders]) {
      if (order.contact_id) usedContactIds.add(order.contact_id);
    }
    for (const vendor of vendors) {
      const isVendorUsed = Object.values(vendor._count).some((count) => count > 0);
      if (isVendorUsed && vendor.contact_id) usedContactIds.add(vendor.contact_id);
    }

    const deletableContacts = contacts.filter((contact) => !usedContactIds.has(contact.id));
    const retainedContactCodes = contacts
      .filter((contact) => usedContactIds.has(contact.id))
      .map((contact) => contact.code);

    if (deletableContacts.length === 0) {
      return { deletedCount: 0, retainedContactCodes };
    }

    const deletableIds = deletableContacts.map((contact) => contact.id);
    const deletableVendorIds = vendors
      .filter((vendor) => vendor.contact_id && deletableIds.includes(vendor.contact_id))
      .map((vendor) => vendor.id);

    await tx.contactAddress.deleteMany({
      where: { organization_id: organizationId, contact_id: { in: deletableIds } },
    });
    await tx.contactTaxRegistration.deleteMany({
      where: { organization_id: organizationId, contact_id: { in: deletableIds } },
    });
    await tx.contactRoleAssignment.deleteMany({
      where: { organization_id: organizationId, contact_id: { in: deletableIds } },
    });
    await tx.contactBankAccount.deleteMany({
      where: { organization_id: organizationId, contact_id: { in: deletableIds } },
    });
    await tx.masterBuyer.deleteMany({
      where: { organization_id: organizationId, contact_id: { in: deletableIds } },
    });
    if (deletableVendorIds.length > 0) {
      await tx.masterVendor.deleteMany({
        where: { organization_id: organizationId, id: { in: deletableVendorIds } },
      });
    }

    for (const contact of deletableContacts) {
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "MASTER_DATA",
        action: "CONTACT_DELETED",
        entityType: "Contact",
        entityId: contact.id,
        details: { code: contact.code, reason: "UNUSED_CONTACT_BULK_DELETE" },
      }, tx);
    }

    const deleted = await tx.contact.deleteMany({
      where: { organization_id: organizationId, id: { in: deletableIds } },
    });
    if (deleted.count !== deletableIds.length) {
      throw new Error("Not all selected unused contacts could be deleted.");
    }
    return { deletedCount: deleted.count, retainedContactCodes };
  });
}
