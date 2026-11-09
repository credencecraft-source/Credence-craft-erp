CREATE TABLE "platform_workspace_user_support_sessions" (
    "id" TEXT NOT NULL,
    "platform_admin_id" TEXT,
    "workspace_user_id" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "platform_workspace_user_support_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_workspace_user_support_sessions_platform_admin_id__idx"
    ON "platform_workspace_user_support_sessions"("platform_admin_id", "expires_at", "ended_at", "revoked_at");

CREATE INDEX "platform_workspace_user_support_sessions_workspace_user_id__idx"
    ON "platform_workspace_user_support_sessions"("workspace_user_id", "created_at");

ALTER TABLE "platform_workspace_user_support_sessions"
    ADD CONSTRAINT "platform_workspace_user_support_sessions_platform_admin_id_fkey"
    FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_workspace_user_support_sessions"
    ADD CONSTRAINT "platform_workspace_user_support_sessions_workspace_user_id_fkey"
    FOREIGN KEY ("workspace_user_id") REFERENCES "workspace_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
