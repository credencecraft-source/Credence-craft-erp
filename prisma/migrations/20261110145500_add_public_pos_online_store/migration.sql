ALTER TABLE "organizations"
ADD COLUMN "online_store_public_key" VARCHAR(64),
ADD COLUMN "online_store_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "organizations_online_store_public_key_key"
ON "organizations"("online_store_public_key");
