CREATE TABLE "platform_email_configurations" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'smtp',
    "smtp_host" VARCHAR(255) NOT NULL,
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_username" VARCHAR(255) NOT NULL,
    "smtp_password_encrypted" VARCHAR(2000) NOT NULL,
    "from_email" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_email_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL DEFAULT 'AUTH',
    "code_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenges_email_purpose_created_at_idx"
ON "otp_challenges"("email", "purpose", "created_at");
