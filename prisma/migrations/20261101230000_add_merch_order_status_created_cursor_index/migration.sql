CREATE INDEX "merch_orders_org_status_created_id_idx"
ON "merchandising_orders" ("organization_id", "finalStatus", "created_at" DESC, "id" DESC);
