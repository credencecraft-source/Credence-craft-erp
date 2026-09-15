CREATE TABLE "factory_work_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "work_order_no" VARCHAR(100) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "total_qty" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_work_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_work_order_size_lines" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "source_finished_goods_id" TEXT NOT NULL,
    "size" VARCHAR(100),
    "buyer_size" VARCHAR(100),
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factory_work_order_size_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "factory_work_orders_organization_id_work_order_no_key" ON "factory_work_orders"("organization_id", "work_order_no");
CREATE INDEX "factory_work_orders_organization_id_created_at_idx" ON "factory_work_orders"("organization_id", "created_at");
CREATE INDEX "factory_work_orders_order_id_created_at_idx" ON "factory_work_orders"("order_id", "created_at");
CREATE UNIQUE INDEX "factory_work_order_size_lines_work_order_id_source_finished_goods_id_key" ON "factory_work_order_size_lines"("work_order_id", "source_finished_goods_id");
CREATE INDEX "factory_work_order_size_lines_source_finished_goods_id_idx" ON "factory_work_order_size_lines"("source_finished_goods_id");

ALTER TABLE "factory_work_orders" ADD CONSTRAINT "factory_work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_work_orders" ADD CONSTRAINT "factory_work_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_work_order_size_lines" ADD CONSTRAINT "factory_work_order_size_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_work_order_size_lines" ADD CONSTRAINT "factory_work_order_size_lines_source_finished_goods_id_fkey" FOREIGN KEY ("source_finished_goods_id") REFERENCES "finished_goods_size_wise"("id") ON DELETE CASCADE ON UPDATE CASCADE;