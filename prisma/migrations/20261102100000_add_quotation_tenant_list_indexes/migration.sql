CREATE INDEX "distribution_quotations_organization_id_created_at_id_idx"
ON "distribution_quotations" ("organization_id", "created_at" DESC, "id" DESC);

CREATE INDEX "distribution_quotation_lines_organization_id_created_at_id_idx"
ON "distribution_quotation_lines" ("organization_id", "created_at" DESC, "id" DESC);
