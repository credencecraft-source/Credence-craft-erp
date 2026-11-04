ALTER TABLE "merchandising_order_qr_print_requests"
  ALTER COLUMN "order_id" DROP NOT NULL,
  ADD COLUMN "source_type" VARCHAR(30) NOT NULL DEFAULT 'ORDER',
  ADD COLUMN "purchase_bill_id" TEXT;

CREATE UNIQUE INDEX "pos_purchase_bills_organization_id_id_key"
  ON "pos_purchase_bills"("organization_id", "id");

CREATE INDEX "qr_print_requests_org_purchase_bill_date_idx"
  ON "merchandising_order_qr_print_requests"("organization_id", "purchase_bill_id", "requested_at");

ALTER TABLE "merchandising_order_qr_print_requests"
  ADD CONSTRAINT "qr_print_requests_purchase_bill_fkey"
  FOREIGN KEY ("organization_id", "purchase_bill_id")
  REFERENCES "pos_purchase_bills"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "qr_print_requests_source_check"
  CHECK (
    ("source_type" = 'ORDER' AND "order_id" IS NOT NULL AND "purchase_bill_id" IS NULL)
    OR ("source_type" = 'POS_PURCHASE_BILL' AND "order_id" IS NULL AND "purchase_bill_id" IS NOT NULL)
  );
