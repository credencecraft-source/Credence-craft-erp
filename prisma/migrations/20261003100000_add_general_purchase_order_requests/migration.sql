ALTER TABLE "purchase_order_lines"
  ADD COLUMN "stock_uom" VARCHAR(100);

CREATE TABLE "general_purchase_order_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "raw_material_id" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_PRICE_APPROVAL',
  "vendor_id" TEXT,
  "vendor_price" DECIMAL(12,4),
  "gst" DECIMAL(10,2),
  "hsn_code" VARCHAR(100),
  "created_by" VARCHAR(255),
  "created_by_user_id" TEXT,
  "approved_by" VARCHAR(255),
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "purchase_order_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "general_purchase_order_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "general_purchase_order_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "general_purchase_order_requests_raw_material_id_fkey"
    FOREIGN KEY ("raw_material_id") REFERENCES "master_raw_materials"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "general_purchase_order_requests_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "master_vendors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "general_purchase_order_requests_purchase_order_id_fkey"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "general_purchase_order_requests_organization_id_status_crea_idx"
  ON "general_purchase_order_requests"("organization_id", "status", "created_at");
CREATE INDEX "general_purchase_order_requests_organization_id_vendor_id_idx"
  ON "general_purchase_order_requests"("organization_id", "vendor_id");
CREATE INDEX "general_purchase_order_requests_purchase_order_id_idx"
  ON "general_purchase_order_requests"("purchase_order_id");

CREATE TRIGGER "audit_general_purchase_order_requests"
  AFTER INSERT OR UPDATE OR DELETE ON "general_purchase_order_requests"
  FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
