CREATE TYPE "OrderQrPrintRequestType" AS ENUM ('PRINT', 'DOWNLOAD');

CREATE TYPE "OrderQrPrintRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "merchandising_order_qr_print_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "request_type" "OrderQrPrintRequestType" NOT NULL,
    "status" "OrderQrPrintRequestStatus" NOT NULL DEFAULT 'PENDING',
    "template_name" VARCHAR(100),
    "field_keys" JSONB NOT NULL,
    "qr_size" INTEGER NOT NULL DEFAULT 256,
    "qr_payload" TEXT NOT NULL,
    "requested_by" VARCHAR(255) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchandising_order_qr_print_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qr_print_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "qr_print_requests_organization_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qr_print_requests_order_fkey"
        FOREIGN KEY ("organization_id", "order_id")
        REFERENCES "merchandising_orders"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "qr_print_requests_org_status_date_idx"
ON "merchandising_order_qr_print_requests"("organization_id", "status", "requested_at");

CREATE INDEX "qr_print_requests_org_order_date_idx"
ON "merchandising_order_qr_print_requests"("organization_id", "order_id", "requested_at");

CREATE TRIGGER "audit_merchandising_order_qr_print_requests"
AFTER INSERT OR UPDATE OR DELETE ON "merchandising_order_qr_print_requests"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
