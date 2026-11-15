CREATE TABLE "platform_alternative_mobile_otp_configurations" (
    "id" TEXT NOT NULL,
    "api_url" VARCHAR(2048) NOT NULL,
    "api_key_encrypted" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_alternative_mobile_otp_configurations_pkey" PRIMARY KEY ("id")
);
