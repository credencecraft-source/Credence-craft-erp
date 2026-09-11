DO $$
BEGIN
    CREATE TYPE "OrganizationInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization_invitations" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invitee_user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "status" "OrganizationInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'invited_by_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'invited_by_user_id') THEN
        ALTER TABLE "organization_invitations" RENAME COLUMN "invited_by_id" TO "invited_by_user_id";
    END IF;
END $$;

ALTER TABLE "organization_invitations"
    ADD COLUMN IF NOT EXISTS "invitee_user_id" TEXT,
    ADD COLUMN IF NOT EXISTS "token" VARCHAR(128),
    ADD COLUMN IF NOT EXISTS "status" "OrganizationInvitationStatus" NOT NULL DEFAULT 'PENDING';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'recipient_email') THEN
        UPDATE "organization_invitations" invitation
        SET "invitee_user_id" = users.id
        FROM "workspace_users" users
        WHERE invitation."invitee_user_id" IS NULL
          AND lower(invitation."recipient_email") = lower(users.email);
    END IF;
END $$;

UPDATE "organization_invitations"
SET "token" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "token" IS NULL;

ALTER TABLE "organization_invitations" ALTER COLUMN "token" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_token_key" ON "organization_invitations"("token");
CREATE INDEX IF NOT EXISTS "organization_invitations_invitee_user_id_status_expires_at_idx" ON "organization_invitations"("invitee_user_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "organization_invitations_organization_id_status_idx" ON "organization_invitations"("organization_id", "status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_invitations'::regclass AND confrelid = 'organizations'::regclass) THEN
        ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_invitations'::regclass AND confrelid = 'workspace_users'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'organization_invitations'::regclass AND attname = 'invitee_user_id')::smallint]) THEN
        ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'organization_invitations'::regclass AND confrelid = 'workspace_users'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'organization_invitations'::regclass AND attname = 'invited_by_user_id')::smallint]) THEN
        ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE "workspace_notifications" (
    "id" TEXT NOT NULL,
    "workspace_user_id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "reference_id" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "body" VARCHAR(500),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workspace_notifications_workspace_user_id_read_at_created_at_idx" ON "workspace_notifications"("workspace_user_id", "read_at", "created_at");
ALTER TABLE "workspace_notifications" ADD CONSTRAINT "workspace_notifications_workspace_user_id_fkey" FOREIGN KEY ("workspace_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
