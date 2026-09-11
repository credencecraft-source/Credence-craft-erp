-- Add source tracking to orders.
ALTER TABLE "merchandising_orders" ADD COLUMN "sourceStatus" VARCHAR(50) NOT NULL DEFAULT 'DIRECT';

CREATE TYPE "OrderShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "order_shares" (
  "id" TEXT NOT NULL,
  "source_order_id" TEXT NOT NULL,
  "source_organization_id" TEXT NOT NULL,
  "target_organization_id" TEXT,
  "target_workspace_user_id" TEXT NOT NULL,
  "destination_organization_id" TEXT,
  "shared_by_user_id" TEXT NOT NULL,
  "accepted_by_user_id" TEXT,
  "status" "OrderShareStatus" NOT NULL DEFAULT 'PENDING',
  "accepted_order_id" TEXT,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_shares_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_shares_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shares_source_organization_id_fkey" FOREIGN KEY ("source_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shares_target_organization_id_fkey" FOREIGN KEY ("target_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shares_target_workspace_user_id_fkey" FOREIGN KEY ("target_workspace_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shares_destination_organization_id_fkey" FOREIGN KEY ("destination_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "order_shares_shared_by_user_id_fkey" FOREIGN KEY ("shared_by_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_shares_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "order_shares_accepted_order_id_fkey" FOREIGN KEY ("accepted_order_id") REFERENCES "merchandising_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_shares_source_order_id_target_workspace_user_id_key" ON "order_shares"("source_order_id", "target_workspace_user_id");
CREATE INDEX "order_shares_target_organization_id_status_created_at_idx" ON "order_shares"("target_organization_id", "status", "created_at");
CREATE INDEX "order_shares_source_order_id_status_idx" ON "order_shares"("source_order_id", "status");