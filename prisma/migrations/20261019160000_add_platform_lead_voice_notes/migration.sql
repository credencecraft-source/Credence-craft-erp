CREATE TABLE "platform_lead_voice_notes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "audio_data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_lead_voice_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_lead_voice_notes_lead_id_created_at_idx"
ON "platform_lead_voice_notes"("lead_id", "created_at");

ALTER TABLE "platform_lead_voice_notes"
ADD CONSTRAINT "platform_lead_voice_notes_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "platform_leads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;