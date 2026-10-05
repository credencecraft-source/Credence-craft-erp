CREATE TABLE "batch_masters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "contractor_name" VARCHAR(255),
    "laborer_name" VARCHAR(255),
    "assigned_quantity" INTEGER NOT NULL,
    "piece_rate" DECIMAL(12,4),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "batch_masters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_floor_process_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'UNASSIGNED',
    "scanned_by" TEXT,
    "received_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_floor_process_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_floor_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "source_log_id" TEXT NOT NULL,
    "from_process_id" TEXT NOT NULL,
    "to_process_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING_RECEIPT',
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "sent_by" TEXT NOT NULL,
    "received_by" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_floor_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_floor_transfers_source_log_id_key"
ON "shop_floor_transfers"("source_log_id");

CREATE INDEX "batch_masters_organization_id_process_id_status_created_at_idx"
ON "batch_masters"("organization_id", "process_id", "status", "created_at");

CREATE INDEX "batch_masters_work_order_id_process_id_created_at_idx"
ON "batch_masters"("work_order_id", "process_id", "created_at");

CREATE INDEX "shop_floor_process_logs_organization_id_process_id_status_created_at_idx"
ON "shop_floor_process_logs"("organization_id", "process_id", "status", "created_at");

CREATE INDEX "shop_floor_process_logs_work_order_id_process_id_status_idx"
ON "shop_floor_process_logs"("work_order_id", "process_id", "status");

CREATE INDEX "shop_floor_process_logs_batch_id_status_idx"
ON "shop_floor_process_logs"("batch_id", "status");

CREATE INDEX "shop_floor_transfers_organization_id_to_process_id_status_sent_at_idx"
ON "shop_floor_transfers"("organization_id", "to_process_id", "status", "sent_at");

CREATE INDEX "shop_floor_transfers_organization_id_work_order_id_sent_at_idx"
ON "shop_floor_transfers"("organization_id", "work_order_id", "sent_at");

ALTER TABLE "batch_masters"
ADD CONSTRAINT "batch_masters_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "batch_masters_work_order_id_fkey"
FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "batch_masters_process_id_fkey"
FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_floor_process_logs"
ADD CONSTRAINT "shop_floor_process_logs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_process_logs_work_order_id_fkey"
FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_process_logs_process_id_fkey"
FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_process_logs_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "batch_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shop_floor_transfers"
ADD CONSTRAINT "shop_floor_transfers_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_transfers_work_order_id_fkey"
FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_transfers_source_log_id_fkey"
FOREIGN KEY ("source_log_id") REFERENCES "shop_floor_process_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_transfers_from_process_id_fkey"
FOREIGN KEY ("from_process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "shop_floor_transfers_to_process_id_fkey"
FOREIGN KEY ("to_process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "audit_batch_masters"
AFTER INSERT OR UPDATE OR DELETE ON "batch_masters"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();

CREATE TRIGGER "audit_shop_floor_process_logs"
AFTER INSERT OR UPDATE OR DELETE ON "shop_floor_process_logs"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();

CREATE TRIGGER "audit_shop_floor_transfers"
AFTER INSERT OR UPDATE OR DELETE ON "shop_floor_transfers"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
