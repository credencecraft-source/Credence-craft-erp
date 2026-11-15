CREATE TABLE "platform_whatsapp_configurations" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'default',
    "api_key_encrypted" VARCHAR(4000),
    "namespace" VARCHAR(255) NOT NULL DEFAULT 'decc5535_5d4b_402c_9592_3165bf9c35e4',
    "callback_token_hash" VARCHAR(64),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_whatsapp_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_whatsapp_templates" (
    "id" TEXT NOT NULL,
    "template_name" VARCHAR(255) NOT NULL,
    "sample_template_text" VARCHAR(5000) NOT NULL,
    "integrated_number" VARCHAR(20) NOT NULL,
    "image_url" VARCHAR(2048),
    "language_code" VARCHAR(20) NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_whatsapp_campaign_messages" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    "provider_request_id" VARCHAR(255),
    "failure_summary" VARCHAR(500),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_whatsapp_campaign_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_whatsapp_campaign_message_recipients" (
    "id" TEXT NOT NULL,
    "campaign_message_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_name" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "provider_message_id" VARCHAR(255),
    "failure_summary" VARCHAR(500),
    "delivered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_whatsapp_campaign_message_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_whatsapp_templates_template_name_language_code_key"
ON "platform_whatsapp_templates"("template_name", "language_code");

CREATE INDEX "platform_whatsapp_templates_is_active_template_name_idx"
ON "platform_whatsapp_templates"("is_active", "template_name");

CREATE INDEX "platform_whatsapp_campaign_messages_status_scheduled_at_idx"
ON "platform_whatsapp_campaign_messages"("status", "scheduled_at");

CREATE INDEX "platform_whatsapp_campaign_messages_campaign_id_created_at_idx"
ON "platform_whatsapp_campaign_messages"("campaign_id", "created_at");

CREATE UNIQUE INDEX "wa_campaign_recipient_lead_key"
ON "platform_whatsapp_campaign_message_recipients"("campaign_message_id", "lead_id");

CREATE INDEX "wa_campaign_recipient_provider_status_idx"
ON "platform_whatsapp_campaign_message_recipients"("provider_message_id", "status");

CREATE INDEX "wa_campaign_recipient_status_idx"
ON "platform_whatsapp_campaign_message_recipients"("campaign_message_id", "status");

ALTER TABLE "platform_whatsapp_campaign_messages"
ADD CONSTRAINT "platform_whatsapp_campaign_messages_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "platform_campaigns"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_whatsapp_campaign_messages"
ADD CONSTRAINT "platform_whatsapp_campaign_messages_template_id_fkey"
FOREIGN KEY ("template_id") REFERENCES "platform_whatsapp_templates"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_whatsapp_campaign_message_recipients"
ADD CONSTRAINT "platform_whatsapp_campaign_message_recipients_campaign_message_id_fkey"
FOREIGN KEY ("campaign_message_id") REFERENCES "platform_whatsapp_campaign_messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_whatsapp_campaign_message_recipients"
ADD CONSTRAINT "platform_whatsapp_campaign_message_recipients_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "platform_leads"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
