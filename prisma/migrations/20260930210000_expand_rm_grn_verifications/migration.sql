ALTER TABLE "rm_grn_verifications"
  RENAME COLUMN "actual_count_quantity" TO "verified_quantity";

ALTER TABLE "rm_grn_verifications"
  ADD COLUMN "master_purchase_order_id" TEXT,
  ADD COLUMN "po_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "grouped_qty_grn" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "approved_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "rejected_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fresh_excess" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "total_excess" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "available_to_allocate" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "grouped_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "grouped_balance_to_allocate" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "rm_grn_verifications" AS verification
SET "master_purchase_order_id" = purchase_order_line."master_purchase_order_id",
    "po_quantity" = COALESCE(master_group."total_grouped_qty", 0),
    "grouped_qty_grn" = COALESCE(master_group."total_grouped_qty", 0)
FROM "inventory_receipt_lines" AS receipt_line
JOIN "purchase_order_lines" AS purchase_order_line
  ON purchase_order_line."id" = receipt_line."purchase_order_line_id"
LEFT JOIN "master_purchase_orders" AS master_group
  ON master_group."id" = purchase_order_line."master_purchase_order_id"
WHERE receipt_line."id" = verification."inventory_receipt_line_id";

ALTER TABLE "rm_grn_verifications"
  ADD CONSTRAINT "rm_grn_verifications_master_purchase_order_id_fkey"
  FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "rm_grn_verifications_organization_id_master_purchase_order__idx"
  ON "rm_grn_verifications"("organization_id", "master_purchase_order_id");

CREATE TABLE "rm_grn_verification_allocations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "verification_id" TEXT NOT NULL,
  "grouped_purchase_order_id" TEXT NOT NULL,
  "verification_allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rm_grn_verification_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rm_grn_verification_allocations_verification_id_grouped_pur_key"
  ON "rm_grn_verification_allocations"("verification_id", "grouped_purchase_order_id");

CREATE INDEX "rm_grn_verification_allocations_organization_id_grouped_pur_idx"
  ON "rm_grn_verification_allocations"("organization_id", "grouped_purchase_order_id");

ALTER TABLE "rm_grn_verification_allocations"
  ADD CONSTRAINT "rm_grn_verification_allocations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rm_grn_verification_allocations_verification_id_fkey"
  FOREIGN KEY ("verification_id") REFERENCES "rm_grn_verifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rm_grn_verification_allocations_grouped_purchase_order_id_fkey"
  FOREIGN KEY ("grouped_purchase_order_id") REFERENCES "grouped_purchase_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "audit_rm_grn_verification_allocations"
AFTER INSERT OR UPDATE OR DELETE ON "rm_grn_verification_allocations"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();