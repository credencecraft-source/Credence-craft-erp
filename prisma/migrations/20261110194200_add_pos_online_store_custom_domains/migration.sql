CREATE TABLE "organization_online_store_domains" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "hostname" VARCHAR(220) NOT NULL,
    "provider" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    "verification_token" VARCHAR(64) NOT NULL,
    "provider_dns_records" JSONB,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_online_store_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_online_store_domains_hostname_key"
ON "organization_online_store_domains"("hostname");

CREATE INDEX "organization_online_store_domains_organization_id_created_at_idx"
ON "organization_online_store_domains"("organization_id", "created_at");

CREATE INDEX "organization_online_store_domains_organization_id_status_idx"
ON "organization_online_store_domains"("organization_id", "status");

ALTER TABLE "organization_online_store_domains"
ADD CONSTRAINT "organization_online_store_domains_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
