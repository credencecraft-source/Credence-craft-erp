ALTER TABLE "master_entities"
  ADD CONSTRAINT "master_entities_organization_id_id_key"
  UNIQUE ("organization_id", "id");

ALTER TABLE "master_locations"
  ADD CONSTRAINT "master_locations_organization_id_entity_id_id_key"
  UNIQUE ("organization_id", "entity_id", "id");

ALTER TABLE "master_locations"
  DROP CONSTRAINT "master_locations_entity_id_fkey",
  ADD CONSTRAINT "master_locations_organization_id_entity_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id")
    REFERENCES "master_entities"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "merchandising_orders"
  ADD COLUMN "entity_id" TEXT;
ALTER TABLE "grouped_purchase_orders"
  ADD COLUMN "entity_id" TEXT;
ALTER TABLE "master_purchase_orders"
  ADD COLUMN "entity_id" TEXT;
ALTER TABLE "purchase_orders"
  ADD COLUMN "entity_id" TEXT;
ALTER TABLE "inventory_receipts"
  ADD COLUMN "entity_id" TEXT,
  ADD COLUMN "location_id" TEXT;

CREATE INDEX "merchandising_orders_organization_id_entity_id_created_at_idx"
  ON "merchandising_orders"("organization_id", "entity_id", "created_at");
CREATE INDEX "grouped_purchase_orders_organization_id_entity_id_idx"
  ON "grouped_purchase_orders"("organization_id", "entity_id");
CREATE INDEX "master_purchase_orders_organization_id_entity_id_idx"
  ON "master_purchase_orders"("organization_id", "entity_id");
CREATE INDEX "purchase_orders_organization_id_entity_id_idx"
  ON "purchase_orders"("organization_id", "entity_id");
CREATE INDEX "inventory_receipts_organization_id_entity_id_location_id_idx"
  ON "inventory_receipts"("organization_id", "entity_id", "location_id");

ALTER TABLE "merchandising_orders"
  ADD CONSTRAINT "merchandising_orders_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id")
  REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grouped_purchase_orders"
  ADD CONSTRAINT "grouped_purchase_orders_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id")
  REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "master_purchase_orders"
  ADD CONSTRAINT "master_purchase_orders_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id")
  REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id")
  REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_receipts"
  ADD CONSTRAINT "inventory_receipts_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id")
  REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inventory_receipts_organization_id_entity_id_location_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id", "location_id")
  REFERENCES "master_locations"("organization_id", "entity_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
