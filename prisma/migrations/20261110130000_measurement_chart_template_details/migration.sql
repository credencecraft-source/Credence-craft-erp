-- AlterTable
ALTER TABLE "uniform_employee_measurement_details" ADD COLUMN     "measurement_area_name" TEXT,
ALTER COLUMN "measurement_area_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "master_measurement_chart_details" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "measurement_chart_id" TEXT NOT NULL,
    "measurement_area_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_measurement_chart_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_chart_details_value_id_key" ON "master_measurement_chart_details"("value_id");

-- CreateIndex
CREATE INDEX "master_measurement_chart_details_organization_id_measuremen_idx" ON "master_measurement_chart_details"("organization_id", "measurement_chart_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_chart_details_organization_id_id_key" ON "master_measurement_chart_details"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_chart_details_organization_id_measuremen_key" ON "master_measurement_chart_details"("organization_id", "measurement_chart_id", "measurement_area_name");

-- AddForeignKey
ALTER TABLE "master_measurement_chart_details" ADD CONSTRAINT "master_measurement_chart_details_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_measurement_chart_details" ADD CONSTRAINT "master_measurement_chart_details_organization_id_measureme_fkey" FOREIGN KEY ("organization_id", "measurement_chart_id") REFERENCES "master_measurement_charts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
