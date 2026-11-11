-- AlterTable
ALTER TABLE "master_measurement_chart_details" ADD COLUMN     "maximum_value" DECIMAL(10,2),
ADD COLUMN     "minimum_value" DECIMAL(10,2),
ADD COLUMN     "size_id" TEXT;

-- AlterTable
ALTER TABLE "uniform_employee_measurements" ALTER COLUMN "size_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "master_measurement_chart_details" ADD CONSTRAINT "master_measurement_chart_details_organization_id_size_id_fkey" FOREIGN KEY ("organization_id", "size_id") REFERENCES "master_sizes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
