CREATE TABLE "finished_goods_sku_stocks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "style_name" VARCHAR(255) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "article_no" VARCHAR(100) NOT NULL,
    "brand" VARCHAR(150),
    "size" VARCHAR(100),
    "colour" VARCHAR(150),
    "product_category" VARCHAR(150),
    "sub_product_category" VARCHAR(150),
    "added_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_user" VARCHAR(255) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "qty_in" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "qty_out" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_stock" DECIMAL(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT "finished_goods_sku_stocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finished_goods_sku_stocks_organization_id_style_name_idx" ON "finished_goods_sku_stocks"("organization_id", "style_name");
CREATE INDEX "finished_goods_sku_stocks_organization_id_added_time_idx" ON "finished_goods_sku_stocks"("organization_id", "added_time");

ALTER TABLE "finished_goods_sku_stocks" ADD CONSTRAINT "finished_goods_sku_stocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
