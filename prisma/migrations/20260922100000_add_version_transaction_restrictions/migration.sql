CREATE TABLE "version_transaction_restrictions" (
    "restriction_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "form_key" VARCHAR(150) NOT NULL,
    "monthly_entry_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "version_transaction_restrictions_pkey" PRIMARY KEY ("restriction_id")
);

CREATE UNIQUE INDEX "version_transaction_restrictions_version_id_segment_id_form_key_key"
    ON "version_transaction_restrictions"("version_id", "segment_id", "form_key");

CREATE INDEX "version_transaction_restrictions_version_id_segment_id_idx"
    ON "version_transaction_restrictions"("version_id", "segment_id");

ALTER TABLE "version_transaction_restrictions"
    ADD CONSTRAINT "version_transaction_restrictions_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "platform_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "version_transaction_restrictions"
    ADD CONSTRAINT "version_transaction_restrictions_segment_id_fkey"
    FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;