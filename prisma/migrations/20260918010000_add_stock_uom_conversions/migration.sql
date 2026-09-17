-- CreateTable
CREATE TABLE "master_stock_uom_converts" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stock_uom_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "how_many" DECIMAL(12,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_stock_uom_converts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_stock_uom_converts_value_id_key" ON "master_stock_uom_converts"("value_id");
CREATE UNIQUE INDEX "master_stock_uom_converts_organization_id_stock_uom_id_name_key" ON "master_stock_uom_converts"("organization_id", "stock_uom_id", "name");
CREATE INDEX "master_stock_uom_converts_organization_id_stock_uom_id_sort_order_idx" ON "master_stock_uom_converts"("organization_id", "stock_uom_id", "sort_order");

-- AddForeignKey
ALTER TABLE "master_stock_uom_converts" ADD CONSTRAINT "master_stock_uom_converts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_stock_uom_converts" ADD CONSTRAINT "master_stock_uom_converts_stock_uom_id_fkey" FOREIGN KEY ("stock_uom_id") REFERENCES "master_uoms"("id") ON DELETE CASCADE ON UPDATE CASCADE;