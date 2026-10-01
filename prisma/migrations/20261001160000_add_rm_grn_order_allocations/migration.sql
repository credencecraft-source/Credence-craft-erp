ALTER TABLE "rm_grn_verification_allocations"
  ADD CONSTRAINT "rm_grn_verification_allocations_organization_id_id_key"
  UNIQUE ("organization_id", "id");

CREATE TABLE "rm_grn_order_allocations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "verification_allocation_id" TEXT NOT NULL,
  "grouped_purchase_order_line_id" TEXT NOT NULL,
  "allocated_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_by" VARCHAR(255),
  "updated_by" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rm_grn_order_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rm_grn_order_allocations_verification_allocation_id_grouped_purchase_order_line_id_key"
  ON "rm_grn_order_allocations"("verification_allocation_id", "grouped_purchase_order_line_id");

CREATE INDEX "rm_grn_order_allocations_organization_id_verification_allocation_id_idx"
  ON "rm_grn_order_allocations"("organization_id", "verification_allocation_id");

CREATE INDEX "rm_grn_order_allocations_organization_id_grouped_purchase_order_line_id_idx"
  ON "rm_grn_order_allocations"("organization_id", "grouped_purchase_order_line_id");

ALTER TABLE "rm_grn_order_allocations"
  ADD CONSTRAINT "rm_grn_order_allocations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rm_grn_order_allocations_organization_id_verification_allocation_id_fkey"
    FOREIGN KEY ("organization_id", "verification_allocation_id")
    REFERENCES "rm_grn_verification_allocations"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "rm_grn_order_allocations_grouped_purchase_order_line_id_fkey"
    FOREIGN KEY ("grouped_purchase_order_line_id") REFERENCES "grouped_purchase_order_lines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "audit_rm_grn_order_allocations"
AFTER INSERT OR UPDATE OR DELETE ON "rm_grn_order_allocations"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();