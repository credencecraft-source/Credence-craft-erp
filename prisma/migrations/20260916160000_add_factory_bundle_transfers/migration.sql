ALTER TABLE "work_order_process_controller_processes" ADD COLUMN "received_qty" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "factory_bundle_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "from_process_id" TEXT NOT NULL,
    "to_process_id" TEXT NOT NULL,
    "issued_qty" INTEGER NOT NULL DEFAULT 0,
    "accepted_qty" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    "remarks" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_bundle_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_bundle_transfer_size_lines" (
    "id" TEXT NOT NULL,
    "bundle_transfer_id" TEXT NOT NULL,
    "size" VARCHAR(100),
    "buyer_size" VARCHAR(100),
    "issued_qty" INTEGER NOT NULL DEFAULT 0,
    "accepted_qty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "factory_bundle_transfer_size_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "factory_bundle_transfers_organization_id_work_order_id_created_at_idx" ON "factory_bundle_transfers"("organization_id", "work_order_id", "created_at");
CREATE INDEX "factory_bundle_transfers_to_process_id_status_idx" ON "factory_bundle_transfers"("to_process_id", "status");
CREATE INDEX "factory_bundle_transfers_from_process_id_created_at_idx" ON "factory_bundle_transfers"("from_process_id", "created_at");
CREATE INDEX "factory_bundle_transfer_size_lines_bundle_transfer_id_idx" ON "factory_bundle_transfer_size_lines"("bundle_transfer_id");

ALTER TABLE "factory_bundle_transfers" ADD CONSTRAINT "factory_bundle_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_bundle_transfers" ADD CONSTRAINT "factory_bundle_transfers_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_bundle_transfers" ADD CONSTRAINT "factory_bundle_transfers_from_process_id_fkey" FOREIGN KEY ("from_process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_bundle_transfers" ADD CONSTRAINT "factory_bundle_transfers_to_process_id_fkey" FOREIGN KEY ("to_process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_bundle_transfer_size_lines" ADD CONSTRAINT "factory_bundle_transfer_size_lines_bundle_transfer_id_fkey" FOREIGN KEY ("bundle_transfer_id") REFERENCES "factory_bundle_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
