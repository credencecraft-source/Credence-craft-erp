-- CreateTable
CREATE TABLE "bill_of_material_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "categoryType" VARCHAR(255),
    "category" VARCHAR(255),
    "subCategory" VARCHAR(255),
    "rawMaterialName" VARCHAR(255),
    "size" VARCHAR(100),
    "consumption" DECIMAL(12,2),
    "requiredQty" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_of_material_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_of_material_items_orderId_idx" ON "bill_of_material_items"("orderId");

-- AddForeignKey
ALTER TABLE "bill_of_material_items" ADD CONSTRAINT "bill_of_material_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
