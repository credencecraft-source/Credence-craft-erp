CREATE TABLE "platform_mobile_otp_configurations" (
    "id" TEXT NOT NULL,
    "widget_id" VARCHAR(255) NOT NULL,
    "token_auth_encrypted" VARCHAR(4000) NOT NULL,
    "auth_key_encrypted" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_mobile_otp_configurations_pkey" PRIMARY KEY ("id")
);
