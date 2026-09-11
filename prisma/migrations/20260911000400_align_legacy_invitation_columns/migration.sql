ALTER TABLE "organization_invitations"
    ADD COLUMN IF NOT EXISTS "recipient_email" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "token_hash" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3);

UPDATE "organization_invitations" invitation
SET "recipient_email" = users.email
FROM "workspace_users" users
WHERE invitation."recipient_email" IS NULL
  AND invitation."invitee_user_id" = users.id;

UPDATE "organization_invitations"
SET "token_hash" = md5("token")
WHERE "token_hash" IS NULL;

ALTER TABLE "organization_invitations"
    ALTER COLUMN "recipient_email" SET NOT NULL,
    ALTER COLUMN "token_hash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_token_hash_key"
    ON "organization_invitations"("token_hash");
