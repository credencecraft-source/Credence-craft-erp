CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "priority" VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_tickets_ticket_number_key" UNIQUE ("ticket_number"),
    CONSTRAINT "support_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "support_tickets_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "support_tickets_organization_id_status_created_at_idx" ON "support_tickets"("organization_id", "status", "created_at");
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");
