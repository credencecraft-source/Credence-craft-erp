import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { ensureDefaultProcessTemplate } from "./organization-process-template-service";

const { transaction } = vi.hoisted(() => {
  const transaction = {
    masterProcessTemplate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    masterProcess: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    masterOperationTemplate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    masterOperationTemplateStep: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    masterProcessTemplateStep: {
      createMany: vi.fn(),
    },
  };
  return { transaction };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDefaultProcessTemplate", () => {
  it("reuses an organization-owned template and does not create duplicates", async () => {
    transaction.masterProcessTemplate.findFirst.mockResolvedValue({ id: "existing-template-id" });

    await expect(ensureDefaultProcessTemplate(
      transaction as unknown as Prisma.TransactionClient,
      "internal-org-id",
    )).resolves.toBe("existing-template-id");

    expect(transaction.masterProcessTemplate.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-id", process_name: "No Embroidery Only Wash" },
      select: { id: true },
    });
    expect(transaction.masterProcessTemplate.create).not.toHaveBeenCalled();
    expect(transaction.masterProcessTemplateStep.createMany).not.toHaveBeenCalled();
    expect(transaction.masterOperationTemplate.create).not.toHaveBeenCalled();
  });
});
