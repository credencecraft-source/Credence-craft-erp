ALTER TABLE "support_tickets"
ADD COLUMN "request_type" VARCHAR(30) NOT NULL DEFAULT 'TICKET',
ADD COLUMN "callback_date" VARCHAR(20),
ADD COLUMN "callback_time" VARCHAR(10);