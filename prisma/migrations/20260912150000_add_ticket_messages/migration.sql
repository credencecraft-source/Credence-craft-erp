CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "support_ticket_id" TEXT NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "workspace_user_id" TEXT,
    "platform_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_messages_support_ticket_id_fkey" FOREIGN KEY ("support_ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ticket_messages_workspace_user_id_fkey" FOREIGN KEY ("workspace_user_id") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ticket_messages_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ticket_messages_support_ticket_id_created_at_idx" ON "ticket_messages"("support_ticket_id", "created_at");