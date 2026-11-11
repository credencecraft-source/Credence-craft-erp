-- CreateTable
CREATE TABLE "uniform_employee_measurement_counters" (
    "organization_id" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_employee_measurement_counters_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "master_measurement_groups" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "group_name" VARCHAR(255) NOT NULL,
    "legacy_metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_measurement_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_measurement_areas" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "measurement_area_name" VARCHAR(255) NOT NULL,
    "legacy_metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_measurement_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uniform_employee_measurements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "measurement_no" VARCHAR(64) NOT NULL,
    "participant_id" TEXT NOT NULL,
    "group_id" TEXT,
    "category_id" TEXT NOT NULL,
    "sub_category_id" TEXT NOT NULL,
    "style_id" TEXT NOT NULL,
    "status" VARCHAR(100) NOT NULL DEFAULT 'Approved',
    "measurement_chart_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "fit_status" VARCHAR(100) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_employee_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uniform_employee_measurement_details" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_measurement_id" TEXT NOT NULL,
    "measurement_area_id" TEXT NOT NULL,
    "input_value" DECIMAL(10,2) NOT NULL,
    "minimum_value" DECIMAL(10,2),
    "maximum_value" DECIMAL(10,2),
    "predicted_size_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uniform_employee_measurement_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_groups_value_id_key" ON "master_measurement_groups"("value_id");

-- CreateIndex
CREATE INDEX "master_measurement_groups_organization_id_is_active_sort_or_idx" ON "master_measurement_groups"("organization_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_groups_organization_id_id_key" ON "master_measurement_groups"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_groups_organization_id_group_name_key" ON "master_measurement_groups"("organization_id", "group_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_areas_value_id_key" ON "master_measurement_areas"("value_id");

-- CreateIndex
CREATE INDEX "master_measurement_areas_organization_id_is_active_sort_ord_idx" ON "master_measurement_areas"("organization_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_areas_organization_id_id_key" ON "master_measurement_areas"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_areas_organization_id_measurement_area_n_key" ON "master_measurement_areas"("organization_id", "measurement_area_name");

-- CreateIndex
CREATE INDEX "uniform_employee_measurements_organization_id_participant_i_idx" ON "uniform_employee_measurements"("organization_id", "participant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "uniform_employee_measurements_organization_id_style_id_crea_idx" ON "uniform_employee_measurements"("organization_id", "style_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uniform_employee_measurements_organization_id_id_key" ON "uniform_employee_measurements"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uniform_employee_measurements_organization_id_measurement_n_key" ON "uniform_employee_measurements"("organization_id", "measurement_no");

-- CreateIndex
CREATE INDEX "uniform_employee_measurement_details_organization_id_employ_idx" ON "uniform_employee_measurement_details"("organization_id", "employee_measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniform_employee_measurement_details_organization_id_id_key" ON "uniform_employee_measurement_details"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uniform_employee_measurement_details_organization_id_employ_key" ON "uniform_employee_measurement_details"("organization_id", "employee_measurement_id", "measurement_area_id");

-- Add unique keys already declared by the Prisma schema but missing from the database.
CREATE UNIQUE INDEX "master_sub_categories_organization_id_id_key" ON "master_sub_categories"("organization_id", "id");
CREATE UNIQUE INDEX "master_measurement_charts_organization_id_id_key" ON "master_measurement_charts"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "uniform_employee_measurement_counters" ADD CONSTRAINT "uniform_employee_measurement_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_measurement_groups" ADD CONSTRAINT "master_measurement_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_measurement_areas" ADD CONSTRAINT "master_measurement_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_participant__fkey" FOREIGN KEY ("organization_id", "participant_id") REFERENCES "uniform_participants"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_group_id_fkey" FOREIGN KEY ("organization_id", "group_id") REFERENCES "master_measurement_groups"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "master_categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_sub_category_fkey" FOREIGN KEY ("organization_id", "sub_category_id") REFERENCES "master_sub_categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_style_id_fkey" FOREIGN KEY ("organization_id", "style_id") REFERENCES "master_articles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_measurement__fkey" FOREIGN KEY ("organization_id", "measurement_chart_id") REFERENCES "master_measurement_charts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurements" ADD CONSTRAINT "uniform_employee_measurements_organization_id_size_id_fkey" FOREIGN KEY ("organization_id", "size_id") REFERENCES "master_sizes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurement_details" ADD CONSTRAINT "uniform_employee_measurement_details_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurement_details" ADD CONSTRAINT "uniform_employee_measurement_details_organization_id_emplo_fkey" FOREIGN KEY ("organization_id", "employee_measurement_id") REFERENCES "uniform_employee_measurements"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurement_details" ADD CONSTRAINT "uniform_employee_measurement_details_organization_id_measu_fkey" FOREIGN KEY ("organization_id", "measurement_area_id") REFERENCES "master_measurement_areas"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uniform_employee_measurement_details" ADD CONSTRAINT "uniform_employee_measurement_details_organization_id_predi_fkey" FOREIGN KEY ("organization_id", "predicted_size_id") REFERENCES "master_sizes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
