CREATE TABLE "rm_grn_verifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "inventory_receipt_line_id" TEXT NOT NULL,
    "actual_count_quantity" DECIMAL(14,2) NOT NULL,
    "created_by" VARCHAR(255),
    "updated_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rm_grn_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rm_grn_verifications_inventory_receipt_line_id_key"
    ON "rm_grn_verifications"("inventory_receipt_line_id");

CREATE INDEX "rm_grn_verifications_organization_id_created_at_idx"
    ON "rm_grn_verifications"("organization_id", "created_at");

ALTER TABLE "rm_grn_verifications"
    ADD CONSTRAINT "rm_grn_verifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "rm_grn_verifications_inventory_receipt_line_id_fkey"
    FOREIGN KEY ("inventory_receipt_line_id") REFERENCES "inventory_receipt_lines"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "audit_rm_grn_verifications"
AFTER INSERT OR UPDATE OR DELETE ON "rm_grn_verifications"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();