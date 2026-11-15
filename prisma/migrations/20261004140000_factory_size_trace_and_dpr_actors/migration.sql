ALTER TABLE "factory_production_update_size_lines"
ADD COLUMN "source_finished_goods_id" TEXT;

ALTER TABLE "factory_bundle_transfer_size_lines"
ADD COLUMN "source_finished_goods_id" TEXT;

ALTER TABLE "factory_daily_production_reports"
ADD COLUMN "submitted_by_user_id" TEXT,
ADD COLUMN "approved_by_user_id" TEXT;

CREATE INDEX "factory_production_update_size_lines_source_finished_goods_id_idx"
ON "factory_production_update_size_lines"("source_finished_goods_id");

CREATE INDEX "factory_bundle_transfer_size_lines_source_finished_goods_id_idx"
ON "factory_bundle_transfer_size_lines"("source_finished_goods_id");

ALTER TABLE "factory_production_update_size_lines"
ADD CONSTRAINT "factory_production_update_size_lines_source_finished_goods_id_fkey"
FOREIGN KEY ("source_finished_goods_id") REFERENCES "finished_goods_size_wise"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "factory_bundle_transfer_size_lines"
ADD CONSTRAINT "factory_bundle_transfer_size_lines_source_finished_goods_id_fkey"
FOREIGN KEY ("source_finished_goods_id") REFERENCES "finished_goods_size_wise"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
