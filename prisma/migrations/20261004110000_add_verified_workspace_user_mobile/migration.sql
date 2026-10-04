ALTER TABLE "workspace_users"
ADD COLUMN "mobile_number" VARCHAR(15),
ADD COLUMN "mobile_verified_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "workspace_users_mobile_number_key"
ON "workspace_users"("mobile_number");
