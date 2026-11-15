CREATE SEQUENCE "organization_number_sequence"
START WITH 1
INCREMENT BY 1
MINVALUE 1
MAXVALUE 9999999999
NO CYCLE;

ALTER TABLE "organizations"
ADD COLUMN "organization_number" VARCHAR(10);

UPDATE "organizations"
SET "organization_number" = LPAD(NEXTVAL('organization_number_sequence')::TEXT, 10, '0');

ALTER TABLE "organizations"
ALTER COLUMN "organization_number"
SET DEFAULT LPAD(NEXTVAL('organization_number_sequence')::TEXT, 10, '0');

ALTER TABLE "organizations"
ALTER COLUMN "organization_number" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_organization_number_key"
ON "organizations"("organization_number");

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_organization_number_range_check"
CHECK ("organization_number" ~ '^[0-9]{10}$');