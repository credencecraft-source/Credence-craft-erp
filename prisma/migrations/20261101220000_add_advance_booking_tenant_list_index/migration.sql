CREATE INDEX "advance_bookings_organization_id_created_at_id_idx"
ON "advance_bookings" ("organization_id", "created_at" DESC, "id" DESC);
