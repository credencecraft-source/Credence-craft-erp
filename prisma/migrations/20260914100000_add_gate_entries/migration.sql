CREATE TABLE "gate_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "entry_no" VARCHAR(100) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "movement_type" VARCHAR(30) NOT NULL,
    "challan_no" VARCHAR(100),
    "person_name" VARCHAR(255) NOT NULL,
    "company_name" VARCHAR(255),
    "id_type" VARCHAR(50),
    "id_number" VARCHAR(100),
    "contact_number" VARCHAR(50),
    "vehicle_number" VARCHAR(50),
    "purpose" VARCHAR(500),
    "item_description" VARCHAR(1000),
    "quantity" DECIMAL(12,2),
    "from_to" VARCHAR(255),
    "entry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "notes" VARCHAR(1000),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gate_entries_organization_id_entry_no_key" ON "gate_entries"("organization_id", "entry_no");
CREATE INDEX "gate_entries_organization_id_entry_at_idx" ON "gate_entries"("organization_id", "entry_at");
CREATE INDEX "gate_entries_organization_id_movement_type_direction_idx" ON "gate_entries"("organization_id", "movement_type", "direction");
CREATE INDEX "gate_entries_organization_id_challan_no_idx" ON "gate_entries"("organization_id", "challan_no");

ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gate_entries" ADD CONSTRAINT "gate_entries_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;