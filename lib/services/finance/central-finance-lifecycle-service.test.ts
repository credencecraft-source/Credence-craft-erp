import {
  FinanceDocumentStatus,
  FinanceSourceType,
  Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { transitionCentralFinanceTransaction } from "@/lib/services/finance/central-finance-lifecycle-service";

function lifecycleClient(input: {
  role?: string;
  permissions?: string[];
  record?: {
    id: string;
    status: FinanceDocumentStatus;
    created_by_user_id: string | null;
    subtotal: Prisma.Decimal;
    cgst_amount: Prisma.Decimal;
    sgst_amount: Prisma.Decimal;
    igst_amount: Prisma.Decimal;
    other_tax_amount: Prisma.Decimal;
    total_amount: Prisma.Decimal;
    source_type: FinanceSourceType;
    source_id: string;
    source_document_number: string;
  } | null;
}) {
  const record = Object.prototype.hasOwnProperty.call(input, "record")
    ? input.record
    : {
      id: "finance-1",
      status: FinanceDocumentStatus.SUBMITTED,
      created_by_user_id: "creator-1",
      subtotal: new Prisma.Decimal("100"),
      cgst_amount: new Prisma.Decimal("9"),
      sgst_amount: new Prisma.Decimal("9"),
      igst_amount: new Prisma.Decimal("0"),
      other_tax_amount: new Prisma.Decimal("0"),
      total_amount: new Prisma.Decimal("118"),
      source_type: FinanceSourceType.POS_SALES_INVOICE,
      source_id: "source-1",
      source_document_number: "INV-1",
    };
  return {
    organizationMembership: {
      findFirst: vi.fn().mockResolvedValue({ role: input.role ?? "APPROVER" }),
    },
    organizationRolePermission: {
      findMany: vi.fn().mockResolvedValue((input.permissions ?? [
        "ACCESS_MODULE_FINANCE_MANAGEMENT",
        "APPROVE_FINANCE_DOCUMENT",
      ]).map((permission) => ({ permission }))),
    },
    centralFinanceTransaction: {
      findFirst: vi.fn().mockResolvedValue(record),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workspaceUser: {
      findUnique: vi.fn().mockResolvedValue({ email: "approver@example.test" }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    financeSyncOutboxLog: { create: vi.fn().mockResolvedValue({ id: "outbox-1" }) },
  };
}

describe("central finance lifecycle", () => {
  it("uses organization-scoped reads before transitioning", async () => {
    const tx = lifecycleClient({ record: null });

    await expect(transitionCentralFinanceTransaction(
      tx as unknown as Prisma.TransactionClient,
      {
        organizationId: "org-A",
        transactionId: "finance-1",
        actorUserId: "approver-1",
        action: "APPROVE",
      },
    )).rejects.toThrow("not found in the authorized organization");

    expect(tx.centralFinanceTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "finance-1", organization_id: "org-A" } }),
    );
    expect(tx.centralFinanceTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("blocks creator self-approval and changes no transaction fields", async () => {
    const tx = lifecycleClient({
      record: {
        id: "finance-1",
        status: FinanceDocumentStatus.SUBMITTED,
        created_by_user_id: "approver-1",
        subtotal: new Prisma.Decimal("100"),
        cgst_amount: new Prisma.Decimal("9"),
        sgst_amount: new Prisma.Decimal("9"),
        igst_amount: new Prisma.Decimal("0"),
        other_tax_amount: new Prisma.Decimal("0"),
        total_amount: new Prisma.Decimal("118"),
        source_type: FinanceSourceType.POS_SALES_INVOICE,
        source_id: "source-1",
        source_document_number: "INV-1",
      },
    });

    await expect(transitionCentralFinanceTransaction(
      tx as unknown as Prisma.TransactionClient,
      {
        organizationId: "org-A",
        transactionId: "finance-1",
        actorUserId: "approver-1",
        action: "APPROVE",
      },
    )).rejects.toThrow("cannot approve their own");

    expect(tx.centralFinanceTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cancellation after posting instead of mutating the posted record", async () => {
    const tx = lifecycleClient({
      permissions: [
        "ACCESS_MODULE_FINANCE_MANAGEMENT",
        "CANCEL_FINANCE_DOCUMENT",
      ],
      record: {
        id: "finance-1",
        status: FinanceDocumentStatus.POSTED,
        created_by_user_id: "creator-1",
        subtotal: new Prisma.Decimal("100"),
        cgst_amount: new Prisma.Decimal("9"),
        sgst_amount: new Prisma.Decimal("9"),
        igst_amount: new Prisma.Decimal("0"),
        other_tax_amount: new Prisma.Decimal("0"),
        total_amount: new Prisma.Decimal("118"),
        source_type: FinanceSourceType.POS_SALES_INVOICE,
        source_id: "source-1",
        source_document_number: "INV-1",
      },
    });

    await expect(transitionCentralFinanceTransaction(
      tx as unknown as Prisma.TransactionClient,
      {
        organizationId: "org-A",
        transactionId: "finance-1",
        actorUserId: "finance-user",
        action: "CANCEL",
      },
    )).rejects.toThrow("cannot transition from POSTED via CANCEL");

    expect(tx.centralFinanceTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("approves without altering financial amounts and records the actor", async () => {
    const tx = lifecycleClient({});

    const result = await transitionCentralFinanceTransaction(
      tx as unknown as Prisma.TransactionClient,
      {
        organizationId: "org-A",
        transactionId: "finance-1",
        actorUserId: "approver-1",
        action: "APPROVE",
      },
    );

    expect(result).toEqual({ id: "finance-1", status: FinanceDocumentStatus.APPROVED });
    expect(tx.centralFinanceTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-A",
        status: FinanceDocumentStatus.SUBMITTED,
      }),
      data: expect.objectContaining({
        status: FinanceDocumentStatus.APPROVED,
        approved_by_user_id: "approver-1",
        approved_by_email: "approver@example.test",
      }),
    }));
    const updateData = tx.centralFinanceTransaction.updateMany.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("total_amount");
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });
});
