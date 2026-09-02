/*
  Warnings:

  - You are about to drop the column `category_id` on the `master_raw_materials` table. All the data in the column will be lost.
  - You are about to drop the column `category_type_id` on the `master_raw_materials` table. All the data in the column will be lost.
  - You are about to drop the column `subcategory_id` on the `master_raw_materials` table. All the data in the column will be lost.
  - Added the required column `raw_material_category_id` to the `master_raw_materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `raw_material_sub_category_id` to the `master_raw_materials` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "master_raw_materials" DROP CONSTRAINT "master_raw_materials_category_id_fkey";

-- DropForeignKey
ALTER TABLE "master_raw_materials" DROP CONSTRAINT "master_raw_materials_category_type_id_fkey";

-- DropForeignKey
ALTER TABLE "master_raw_materials" DROP CONSTRAINT "master_raw_materials_subcategory_id_fkey";

-- AlterTable
ALTER TABLE "master_raw_materials" DROP COLUMN "category_id",
DROP COLUMN "category_type_id",
DROP COLUMN "subcategory_id",
ADD COLUMN     "raw_material_category_id" TEXT NOT NULL,
ADD COLUMN     "raw_material_sub_category_id" TEXT NOT NULL,
ADD COLUMN     "raw_material_type_id" TEXT;

-- CreateTable
CREATE TABLE "master_raw_material_types" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "raw_material_type" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_raw_material_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_raw_material_categories" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "raw_material_type_id" TEXT,
    "raw_material_category" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_raw_material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_raw_material_sub_categories" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "raw_material_category_id" TEXT,
    "raw_material_sub_category" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_raw_material_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_types_value_id_key" ON "master_raw_material_types"("value_id");

-- CreateIndex
CREATE INDEX "master_raw_material_types_organization_id_is_active_idx" ON "master_raw_material_types"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_types_organization_id_raw_material_type_key" ON "master_raw_material_types"("organization_id", "raw_material_type");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_categories_value_id_key" ON "master_raw_material_categories"("value_id");

-- CreateIndex
CREATE INDEX "master_raw_material_categories_organization_id_is_active_idx" ON "master_raw_material_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_categories_organization_id_raw_material_key" ON "master_raw_material_categories"("organization_id", "raw_material_category");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_sub_categories_value_id_key" ON "master_raw_material_sub_categories"("value_id");

-- CreateIndex
CREATE INDEX "master_raw_material_sub_categories_organization_id_is_activ_idx" ON "master_raw_material_sub_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_material_sub_categories_organization_id_raw_mate_key" ON "master_raw_material_sub_categories"("organization_id", "raw_material_sub_category");

-- AddForeignKey
ALTER TABLE "master_raw_material_types" ADD CONSTRAINT "master_raw_material_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_material_categories" ADD CONSTRAINT "master_raw_material_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_material_categories" ADD CONSTRAINT "master_raw_material_categories_raw_material_type_id_fkey" FOREIGN KEY ("raw_material_type_id") REFERENCES "master_raw_material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_material_sub_categories" ADD CONSTRAINT "master_raw_material_sub_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_material_sub_categories" ADD CONSTRAINT "master_raw_material_sub_categories_raw_material_category_i_fkey" FOREIGN KEY ("raw_material_category_id") REFERENCES "master_raw_material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_raw_material_category_id_fkey" FOREIGN KEY ("raw_material_category_id") REFERENCES "master_raw_material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_raw_material_sub_category_id_fkey" FOREIGN KEY ("raw_material_sub_category_id") REFERENCES "master_raw_material_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_raw_material_type_id_fkey" FOREIGN KEY ("raw_material_type_id") REFERENCES "master_raw_material_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
