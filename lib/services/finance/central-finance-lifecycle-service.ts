import {
  FinanceDocumentStatus,
  FinanceExternalProvider,
  FinanceSyncStatus,
  Prisma,
} from "@prisma/client";

import { evaluateOrganizationPermission } from "@/lib/services/organizations/organization-permission-evaluator";

export type FinanceLifecycleAction = "SUBMIT" | "APPROVE" | "POST" | "LOCK" | "CANCEL" | "REVERSE";

const PERMISSION_BY_ACTION: Record<FinanceLifecycleAction, string> = {
  SUBMIT: "SUBMIT_FINANCE_DOCUMENT",
  APPROVE: "APPROVE_FINANCE_DOCUMENT",
  POST: "POST_FINANCE_DOCUMENT",
  LOCK: "LOCK_FINANCE_DOCUMENT",
  CANCEL: "CANCEL_FINANCE_DOCUMENT",
  REVERSE: "REVERSE_FINANCE_DOCUMENT",
};

const NEXT_STATUS: Partial<Record<FinanceLifecycleAction, FinanceDocumentStatus>> = {
  SUBMIT: FinanceDocumentStatus.SUBMITTED,
  APPROVE: FinanceDocumentStatus.APPROVED,
  POST: FinanceDocumentStatus.POSTED,
  LOCK: FinanceDocumentStatus.LOCKED,
  CANCEL: FinanceDocumentStatus.CANCELLED,
};

const ALLOWED_TRANSITIONS: Partial<Record<FinanceLifecycleAction, readonly FinanceDocumentStatus[]>> = {
  SUBMIT: [FinanceDocumentStatus.DRAFT],
  APPROVE: [FinanceDocumentStatus.SUBMITTED],
  POST: [FinanceDocumentStatus.APPROVED],
  LOCK: [FinanceDocumentStatus.POSTED],
  CANCEL: [FinanceDocumentStatus.DRAFT, FinanceDocumentStatus.SUBMITTED, FinanceDocumentStatus.APPROVED],
  REVERSE: [FinanceDocumentStatus.POSTED, FinanceDocumentStatus.LOCKED],
};

async function requireLifecyclePermission(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId: string,
  action: FinanceLifecycleAction,
) {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organization_id: organizationId,
      workspace_user_id: actorUserId,
      is_active: true,
    },
    select: { role: true },
  });
  if (!membership) throw new Error("Access denied: active organization membership is required.");
  if (membership.role === "OWNER") return membership.role;

  const requiredPermission = PERMISSION_BY_ACTION[action];
  const permissions = await tx.organizationRolePermission.findMany({
    where: {
      organization_id: organizationId,
      role: membership.role,
      permission: {
        in: [
          "ACCESS_MODULE_FINANCE_MANAGEMENT",
          "DENY:ACCESS_MODULE_FINANCE_MANAGEMENT",
          requiredPermission,
          `DENY:${requiredPermission}`,
        ],
      },
    },
    select: { permission: true },
  });
  const storedPermissions = permissions.map((permission) => permission.permission);
  const moduleAccess = evaluateOrganizationPermission({
    role: membership.role,
    permission: "ACCESS_MODULE_FINANCE_MANAGEMENT",
    storedPermissions,
    defaultPermissions: [],
  });
  const actionAccess = evaluateOrganizationPermission({
    role: membership.role,
    permission: requiredPermission,
    storedPermissions,
    defaultPermissions: [],
  });
  if (!moduleAccess.allowed || !actionAccess.allowed) {
    throw new Error(`Access denied: ${requiredPermission} is required.`);
  }
  return membership.role;
}

export async function transitionCentralFinanceTransaction(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    transactionId: string;
    actorUserId: string;
    action: FinanceLifecycleAction;
    reversalTransactionId?: string;
  },
) {
  const organizationId = input.organizationId.trim();
  const transactionId = input.transactionId.trim();
  const actorUserId = input.actorUserId.trim();
  const reversalTransactionId = input.reversalTransactionId?.trim();
  if (!organizationId || !transactionId || !actorUserId) {
    throw new Error("Finance lifecycle transition requires an organization, document, and actor.");
  }
  if (input.action === "REVERSE" && !reversalTransactionId) {
    throw new Error("A posted, linked contra-document is required to reverse this transaction.");
  }
  if (input.action !== "REVERSE" && reversalTransactionId) {
    throw new Error("A reversal document may only be supplied for a reverse action.");
  }

  await requireLifecyclePermission(tx, organizationId, actorUserId, input.action);
  const record = await tx.centralFinanceTransaction.findFirst({
    where: { id: transactionId, organization_id: organizationId },
    select: {
      id: true,
      status: true,
      created_by_user_id: true,
      subtotal: true,
      cgst_amount: true,
      sgst_amount: true,
      igst_amount: true,
      other_tax_amount: true,
      total_amount: true,
      source_type: true,
      source_id: true,
      source_document_number: true,
    },
  });
  if (!record) throw new Error("Finance transaction was not found in the authorized organization.");
  if (!ALLOWED_TRANSITIONS[input.action]?.includes(record.status)) {
    throw new Error(`Finance transaction cannot transition from ${record.status} via ${input.action}.`);
  }
  if (input.action === "APPROVE" && record.created_by_user_id === actorUserId) {
    throw new Error("The document creator cannot approve their own financial document.");
  }

  const now = new Date();
  const nextStatus = input.action === "REVERSE"
    ? FinanceDocumentStatus.REVERSED
    : NEXT_STATUS[input.action];
  if (!nextStatus) throw new Error("Finance lifecycle action has no configured next status.");

  if (input.action === "REVERSE") {
    const reversal = await tx.centralFinanceTransaction.findFirst({
      where: {
        id: reversalTransactionId!,
        organization_id: organizationId,
        reversal_of_id: record.id,
        status: FinanceDocumentStatus.POSTED,
      },
      select: {
        id: true,
        subtotal: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        other_tax_amount: true,
        total_amount: true,
      },
    });
    if (!reversal) {
      throw new Error("The reversal document must be posted, tenant-scoped, and linked to this transaction.");
    }
    if (
      !reversal.subtotal.eq(record.subtotal)
      || !reversal.cgst_amount.eq(record.cgst_amount)
      || !reversal.sgst_amount.eq(record.sgst_amount)
      || !reversal.igst_amount.eq(record.igst_amount)
      || !reversal.other_tax_amount.eq(record.other_tax_amount)
      || !reversal.total_amount.eq(record.total_amount)
    ) {
      throw new Error("The posted contra-document amounts do not exactly reverse the original transaction.");
    }
  }

  const data: Prisma.CentralFinanceTransactionUpdateManyMutationInput = {
    status: nextStatus,
    ...(input.action === "APPROVE" ? { approved_by_user_id: actorUserId } : {}),
    ...(input.action === "POST" ? { posted_at: now } : {}),
    ...(input.action === "LOCK" ? { locked_at: now } : {}),
    ...(input.action === "REVERSE" ? { reversed_at: now } : {}),
  };
  const actor = await tx.workspaceUser.findUnique({
    where: { id: actorUserId },
    select: { email: true },
  });
  if (!actor) throw new Error("Finance lifecycle actor is not a valid workspace user.");
  if (input.action === "APPROVE") data.approved_by_email = actor.email;
  const updated = await tx.centralFinanceTransaction.updateMany({
    where: { id: record.id, organization_id: organizationId, status: record.status },
    data,
  });
  if (updated.count !== 1) throw new Error("Finance transaction changed during the lifecycle transition; reload and retry.");

  await tx.auditEvent.create({
    data: {
      organization_id: organizationId,
      user_id: actorUserId,
      module: "FINANCE_MANAGEMENT",
      action: `FINANCE_${input.action}`,
      entity_type: "central_finance_transaction",
      entity_id: record.id,
      details: {
        fromStatus: record.status,
        toStatus: nextStatus,
        sourceType: record.source_type,
        sourceId: record.source_id,
        sourceDocumentNumber: record.source_document_number,
        actorEmail: actor?.email ?? null,
        reversalTransactionId: input.action === "REVERSE" ? reversalTransactionId : null,
      },
    },
  });

  if (input.action === "POST" || input.action === "REVERSE") {
    await tx.financeSyncOutboxLog.create({
      data: {
        organization_id: organizationId,
        transaction_id: record.id,
        provider: FinanceExternalProvider.NONE,
        status: FinanceSyncStatus.PENDING,
        event_type: input.action === "POST" ? "TRANSACTION_POSTED" : "TRANSACTION_REVERSED",
        payload: {
          transactionId: record.id,
          sourceType: record.source_type,
          sourceId: record.source_id,
          reversalTransactionId: reversalTransactionId ?? null,
        },
      },
    });
  }

  return { id: record.id, status: nextStatus };
}
