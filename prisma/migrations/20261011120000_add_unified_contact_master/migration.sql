CREATE TYPE "ContactAddressUsage" AS ENUM ('BILLING', 'SHIPPING', 'BOTH');
CREATE TYPE "ContactTaxRegistrationType" AS ENUM (
  'REGULAR',
  'COMPOSITION',
  'SEZ_DEVELOPER',
  'SEZ_UNIT',
  'INPUT_SERVICE_DISTRIBUTOR',
  'TAX_DEDUCTOR',
  'TAX_COLLECTOR',
  'NON_RESIDENT',
  'OIDAR',
  'OTHER'
);
CREATE TYPE "ContactTaxRegistrationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

CREATE TABLE "contacts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "legal_name" VARCHAR(200) NOT NULL,
  "display_name" VARCHAR(200),
  "email" VARCHAR(255),
  "phone" VARCHAR(40),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_role_definitions" (
  "code" VARCHAR(40) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "contact_role_definitions_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "contact_role_assignments" (
  "organization_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "role_code" VARCHAR(40) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_role_assignments_pkey" PRIMARY KEY ("organization_id", "contact_id", "role_code")
);

CREATE TABLE "contact_tax_registrations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "gstin" VARCHAR(15) NOT NULL,
  "state_code" VARCHAR(2) NOT NULL,
  "legal_name" VARCHAR(200) NOT NULL,
  "registration_type" "ContactTaxRegistrationType" NOT NULL DEFAULT 'REGULAR',
  "status" "ContactTaxRegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_tax_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_addresses" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "tax_registration_id" TEXT,
  "label" VARCHAR(80),
  "usage" "ContactAddressUsage" NOT NULL,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(200),
  "city" VARCHAR(100) NOT NULL,
  "state_name" VARCHAR(100) NOT NULL,
  "state_code" VARCHAR(2),
  "postal_code" VARCHAR(20) NOT NULL,
  "country_code" CHAR(2) NOT NULL DEFAULT 'IN',
  "is_default_billing" BOOLEAN NOT NULL DEFAULT false,
  "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_bank_accounts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "account_holder_name" VARCHAR(200) NOT NULL,
  "account_number_encrypted" TEXT NOT NULL,
  "account_number_last4" CHAR(4) NOT NULL,
  "ifsc_code" CHAR(11) NOT NULL,
  "bank_name" VARCHAR(120) NOT NULL,
  "branch" VARCHAR(120),
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_bank_accounts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "contact_role_definitions" ("code", "label") VALUES
  ('CUSTOMER', 'Customer'),
  ('VENDOR', 'Vendor'),
  ('AGENT', 'Agent'),
  ('DISTRIBUTOR', 'Distributor'),
  ('DEALER', 'Dealer');

CREATE UNIQUE INDEX "contacts_organization_id_id_key" ON "contacts"("organization_id", "id");
CREATE UNIQUE INDEX "contacts_organization_id_code_key" ON "contacts"("organization_id", "code");
CREATE INDEX "contacts_organization_id_legal_name_idx" ON "contacts"("organization_id", "legal_name");
CREATE INDEX "contacts_organization_id_is_active_display_name_idx" ON "contacts"("organization_id", "is_active", "display_name");
CREATE INDEX "contact_role_assignments_organization_id_role_code_is_active_idx" ON "contact_role_assignments"("organization_id", "role_code", "is_active");
CREATE UNIQUE INDEX "contact_tax_registrations_organization_id_gstin_key" ON "contact_tax_registrations"("organization_id", "gstin");
CREATE UNIQUE INDEX "contact_tax_registrations_organization_id_contact_id_id_key" ON "contact_tax_registrations"("organization_id", "contact_id", "id");
CREATE INDEX "contact_tax_registrations_organization_id_contact_id_status_idx" ON "contact_tax_registrations"("organization_id", "contact_id", "status");
CREATE INDEX "contact_addresses_organization_id_contact_id_usage_is_active_idx" ON "contact_addresses"("organization_id", "contact_id", "usage", "is_active");
CREATE INDEX "contact_addresses_organization_id_tax_registration_id_idx" ON "contact_addresses"("organization_id", "tax_registration_id");
CREATE UNIQUE INDEX "contact_addresses_default_billing_per_gstin_key"
  ON "contact_addresses"("organization_id", "contact_id", "tax_registration_id")
  WHERE "is_default_billing" AND "is_active" AND "tax_registration_id" IS NOT NULL;
CREATE UNIQUE INDEX "contact_addresses_default_shipping_per_gstin_key"
  ON "contact_addresses"("organization_id", "contact_id", "tax_registration_id")
  WHERE "is_default_shipping" AND "is_active" AND "tax_registration_id" IS NOT NULL;
CREATE UNIQUE INDEX "contact_addresses_default_billing_without_gstin_key"
  ON "contact_addresses"("organization_id", "contact_id")
  WHERE "is_default_billing" AND "is_active" AND "tax_registration_id" IS NULL;
CREATE UNIQUE INDEX "contact_addresses_default_shipping_without_gstin_key"
  ON "contact_addresses"("organization_id", "contact_id")
  WHERE "is_default_shipping" AND "is_active" AND "tax_registration_id" IS NULL;
CREATE INDEX "contact_bank_accounts_organization_id_contact_id_is_active_idx" ON "contact_bank_accounts"("organization_id", "contact_id", "is_active");
CREATE UNIQUE INDEX "contact_bank_accounts_one_default_per_contact_key"
  ON "contact_bank_accounts"("organization_id", "contact_id")
  WHERE "is_default" AND "is_active";

ALTER TABLE "contact_tax_registrations"
  ADD CONSTRAINT "contact_tax_registrations_gstin_shape_check"
  CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$');
ALTER TABLE "contact_tax_registrations"
  ADD CONSTRAINT "contact_tax_registrations_gstin_state_check"
  CHECK (substring("gstin" FROM 1 FOR 2) = "state_code");
ALTER TABLE "contact_addresses"
  ADD CONSTRAINT "contact_addresses_default_usage_check"
  CHECK (
    (NOT "is_default_billing" OR "usage" IN ('BILLING', 'BOTH'))
    AND (NOT "is_default_shipping" OR "usage" IN ('SHIPPING', 'BOTH'))
  );
ALTER TABLE "contact_bank_accounts"
  ADD CONSTRAINT "contact_bank_accounts_ifsc_check"
  CHECK ("ifsc_code" ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_role_assignments"
  ADD CONSTRAINT "contact_role_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_role_assignments_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_role_assignments_role_code_fkey"
  FOREIGN KEY ("role_code") REFERENCES "contact_role_definitions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_tax_registrations"
  ADD CONSTRAINT "contact_tax_registrations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_tax_registrations_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_addresses"
  ADD CONSTRAINT "contact_addresses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_addresses_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_addresses_organization_id_contact_id_tax_registration_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id", "tax_registration_id")
  REFERENCES "contact_tax_registrations"("organization_id", "contact_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_bank_accounts"
  ADD CONSTRAINT "contact_bank_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_bank_accounts_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "enforce_contact_address_gstin_state"() RETURNS TRIGGER AS $$
DECLARE
  registration_state VARCHAR(2);
BEGIN
  IF NEW."tax_registration_id" IS NULL OR NEW."country_code" <> 'IN' THEN
    RETURN NEW;
  END IF;
  SELECT "state_code" INTO registration_state
  FROM "contact_tax_registrations"
  WHERE "organization_id" = NEW."organization_id"
    AND "contact_id" = NEW."contact_id"
    AND "id" = NEW."tax_registration_id";
  IF registration_state IS NULL OR NEW."state_code" IS DISTINCT FROM registration_state THEN
    RAISE EXCEPTION 'Contact address state must match its GST registration state'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "contact_addresses_gstin_state_trigger"
  BEFORE INSERT OR UPDATE OF "organization_id", "contact_id", "tax_registration_id", "state_code", "country_code"
  ON "contact_addresses"
  FOR EACH ROW EXECUTE FUNCTION "enforce_contact_address_gstin_state"();

INSERT INTO "contacts" (
  "id", "organization_id", "code", "legal_name", "display_name", "is_active", "created_at", "updated_at"
)
SELECT
  'LEGACY-V-' || vendor."id",
  vendor."organization_id",
  'V-' || md5(vendor."id"),
  left(upper(trim(vendor."vendor")), 200),
  left(upper(trim(vendor."vendor")), 200),
  vendor."is_active",
  vendor."created_at",
  vendor."updated_at"
FROM "master_vendors" vendor
WHERE trim(vendor."vendor") <> '';

INSERT INTO "contact_role_assignments" ("organization_id", "contact_id", "role_code", "is_active")
SELECT vendor."organization_id", 'LEGACY-V-' || vendor."id", 'VENDOR', vendor."is_active"
FROM "master_vendors" vendor
WHERE trim(vendor."vendor") <> '';

INSERT INTO "contacts" (
  "id", "organization_id", "code", "legal_name", "display_name", "email", "is_active", "created_at", "updated_at"
)
SELECT
  'LEGACY-B-' || buyer."id",
  buyer."organization_id",
  'B-' || md5(buyer."id"),
  left(upper(trim(buyer."buyer_name")), 200),
  left(upper(trim(buyer."buyer_name")), 200),
  left(upper(buyer."buyer_email"), 255),
  buyer."is_active",
  buyer."created_at",
  buyer."updated_at"
FROM "master_buyers" buyer
WHERE trim(buyer."buyer_name") <> '';

INSERT INTO "contact_role_assignments" ("organization_id", "contact_id", "role_code", "is_active")
SELECT buyer."organization_id", 'LEGACY-B-' || buyer."id", 'CUSTOMER', buyer."is_active"
FROM "master_buyers" buyer
WHERE trim(buyer."buyer_name") <> '';

ALTER TABLE "master_vendors" ADD COLUMN "contact_id" TEXT;
ALTER TABLE "master_buyers" ADD COLUMN "contact_id" TEXT;
CREATE UNIQUE INDEX "master_vendors_organization_id_contact_id_key" ON "master_vendors"("organization_id", "contact_id");
CREATE UNIQUE INDEX "master_buyers_organization_id_contact_id_key" ON "master_buyers"("organization_id", "contact_id");
UPDATE "master_vendors"
SET "contact_id" = 'LEGACY-V-' || "id"
WHERE trim("vendor") <> '';
UPDATE "master_buyers"
SET "contact_id" = 'LEGACY-B-' || "id"
WHERE trim("buyer_name") <> '';
ALTER TABLE "master_vendors"
  ADD CONSTRAINT "master_vendors_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "master_buyers"
  ADD CONSTRAINT "master_buyers_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "link_legacy_vendor_to_contact"() RETURNS TRIGGER AS $$
DECLARE
  contact_identifier TEXT;
BEGIN
  IF NEW."contact_id" IS NULL THEN
    contact_identifier := 'LEGACY-V-' || NEW."id";
    INSERT INTO "contacts" (
      "id", "organization_id", "code", "legal_name", "display_name", "is_active", "created_at", "updated_at"
    ) VALUES (
      contact_identifier,
      NEW."organization_id",
      'V-' || md5(NEW."id"),
      left(upper(trim(NEW."vendor")), 200),
      left(upper(trim(NEW."vendor")), 200),
      NEW."is_active",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
    INSERT INTO "contact_role_assignments" ("organization_id", "contact_id", "role_code", "is_active")
    VALUES (NEW."organization_id", contact_identifier, 'VENDOR', NEW."is_active");
    NEW."contact_id" := contact_identifier;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE "contacts"
    SET "legal_name" = left(upper(trim(NEW."vendor")), 200),
        "display_name" = left(upper(trim(NEW."vendor")), 200),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "organization_id" = NEW."organization_id"
      AND "id" = NEW."contact_id"
      AND ("legal_name" IS DISTINCT FROM left(upper(trim(NEW."vendor")), 200)
        OR "display_name" IS DISTINCT FROM left(upper(trim(NEW."vendor")), 200));
    UPDATE "contact_role_assignments"
    SET "is_active" = NEW."is_active"
    WHERE "organization_id" = NEW."organization_id"
      AND "contact_id" = NEW."contact_id"
      AND "role_code" = 'VENDOR'
      AND "is_active" IS DISTINCT FROM NEW."is_active";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "master_vendors_contact_link_trigger"
  BEFORE INSERT OR UPDATE OF "vendor", "is_active", "contact_id"
  ON "master_vendors"
  FOR EACH ROW EXECUTE FUNCTION "link_legacy_vendor_to_contact"();

CREATE FUNCTION "link_legacy_buyer_to_contact"() RETURNS TRIGGER AS $$
DECLARE
  contact_identifier TEXT;
BEGIN
  IF NEW."contact_id" IS NULL THEN
    contact_identifier := 'LEGACY-B-' || NEW."id";
    INSERT INTO "contacts" (
      "id", "organization_id", "code", "legal_name", "display_name", "email", "is_active", "created_at", "updated_at"
    ) VALUES (
      contact_identifier,
      NEW."organization_id",
      'B-' || md5(NEW."id"),
      left(upper(trim(NEW."buyer_name")), 200),
      left(upper(trim(NEW."buyer_name")), 200),
      left(upper(NEW."buyer_email"), 255),
      NEW."is_active",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
    INSERT INTO "contact_role_assignments" ("organization_id", "contact_id", "role_code", "is_active")
    VALUES (NEW."organization_id", contact_identifier, 'CUSTOMER', NEW."is_active");
    NEW."contact_id" := contact_identifier;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE "contacts"
    SET "legal_name" = left(upper(trim(NEW."buyer_name")), 200),
        "display_name" = left(upper(trim(NEW."buyer_name")), 200),
        "email" = left(upper(NEW."buyer_email"), 255),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "organization_id" = NEW."organization_id"
      AND "id" = NEW."contact_id"
      AND ("legal_name" IS DISTINCT FROM left(upper(trim(NEW."buyer_name")), 200)
        OR "display_name" IS DISTINCT FROM left(upper(trim(NEW."buyer_name")), 200)
        OR "email" IS DISTINCT FROM left(upper(NEW."buyer_email"), 255));
    UPDATE "contact_role_assignments"
    SET "is_active" = NEW."is_active"
    WHERE "organization_id" = NEW."organization_id"
      AND "contact_id" = NEW."contact_id"
      AND "role_code" = 'CUSTOMER'
      AND "is_active" IS DISTINCT FROM NEW."is_active";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "master_buyers_contact_link_trigger"
  BEFORE INSERT OR UPDATE OF "buyer_name", "buyer_email", "is_active", "contact_id"
  ON "master_buyers"
  FOR EACH ROW EXECUTE FUNCTION "link_legacy_buyer_to_contact"();

ALTER TABLE "purchase_orders"
  ADD COLUMN "contact_id" TEXT,
  ADD COLUMN "counterparty_role_code" VARCHAR(40);
UPDATE "purchase_orders" purchase_order
SET "contact_id" = vendor."contact_id",
    "counterparty_role_code" = 'VENDOR'
FROM "master_vendors" vendor
WHERE purchase_order."organization_id" = vendor."organization_id"
  AND purchase_order."vendor_id" = vendor."id"
  AND trim(vendor."vendor") <> '';
CREATE INDEX "purchase_orders_organization_id_contact_id_idx" ON "purchase_orders"("organization_id", "contact_id");
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_orders_organization_id_contact_id_counterparty_role_code_fkey"
  FOREIGN KEY ("organization_id", "contact_id", "counterparty_role_code")
  REFERENCES "contact_role_assignments"("organization_id", "contact_id", "role_code")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_orders_contact_role_pair_check"
  CHECK (("contact_id" IS NULL) = ("counterparty_role_code" IS NULL));

ALTER TABLE "merchandising_orders"
  ADD COLUMN "contact_id" TEXT,
  ADD COLUMN "counterparty_role_code" VARCHAR(40);
UPDATE "merchandising_orders" order_row
SET "contact_id" = buyer."contact_id",
    "counterparty_role_code" = buyer."role_code"
FROM (
  SELECT mb."organization_id",
         lower(trim(mb."buyer_name")) AS "normalized_name",
         min(mb."contact_id") AS "contact_id",
         CASE
           WHEN bool_or(assignment."role_code" = 'CUSTOMER') THEN 'CUSTOMER'
           WHEN bool_or(assignment."role_code" = 'DEALER') THEN 'DEALER'
           ELSE 'DISTRIBUTOR'
         END AS "role_code"
  FROM "master_buyers" mb
  JOIN "contact_role_assignments" assignment
    ON assignment."organization_id" = mb."organization_id"
    AND assignment."contact_id" = mb."contact_id"
    AND assignment."is_active" = true
    AND assignment."role_code" IN ('CUSTOMER', 'DEALER', 'DISTRIBUTOR')
  WHERE mb."is_active" = true AND trim(mb."buyer_name") <> ''
  GROUP BY mb."organization_id", lower(trim(mb."buyer_name"))
  HAVING count(DISTINCT mb."id") = 1
) buyer
WHERE order_row."organization_id" = buyer."organization_id"
  AND lower(trim(order_row."buyer")) = buyer."normalized_name";
CREATE INDEX "merchandising_orders_organization_id_contact_id_idx" ON "merchandising_orders"("organization_id", "contact_id");
ALTER TABLE "merchandising_orders"
  ADD CONSTRAINT "merchandising_orders_organization_id_contact_id_fkey"
  FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "merchandising_orders_organization_id_contact_id_counterparty_role_code_fkey"
  FOREIGN KEY ("organization_id", "contact_id", "counterparty_role_code")
  REFERENCES "contact_role_assignments"("organization_id", "contact_id", "role_code")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "merchandising_orders_contact_role_pair_check"
  CHECK (("contact_id" IS NULL) = ("counterparty_role_code" IS NULL));

CREATE FUNCTION "link_purchase_order_contact"() RETURNS TRIGGER AS $$
DECLARE
  resolved_contact_id TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."vendor_id" IS DISTINCT FROM OLD."vendor_id" THEN
    NEW."contact_id" := NULL;
    NEW."counterparty_role_code" := NULL;
  END IF;
  IF NEW."contact_id" IS NULL THEN
    SELECT vendor."contact_id" INTO resolved_contact_id
    FROM "master_vendors" vendor
    WHERE vendor."organization_id" = NEW."organization_id"
      AND vendor."id" = NEW."vendor_id"
      AND vendor."is_active" = true;
    IF resolved_contact_id IS NULL THEN
      RAISE EXCEPTION 'Purchase orders require a vendor contact linked to the selected vendor'
        USING ERRCODE = '23514';
    END IF;
    NEW."contact_id" := resolved_contact_id;
    NEW."counterparty_role_code" := 'VENDOR';
  END IF;
  IF NEW."counterparty_role_code" <> 'VENDOR'
    OR NOT EXISTS (
      SELECT 1
      FROM "master_vendors" vendor
      WHERE vendor."organization_id" = NEW."organization_id"
        AND vendor."id" = NEW."vendor_id"
        AND vendor."contact_id" = NEW."contact_id"
        AND vendor."is_active" = true
    )
    OR NOT EXISTS (
      SELECT 1
      FROM "contacts" contact
      JOIN "contact_role_assignments" assignment
        ON assignment."organization_id" = contact."organization_id"
        AND assignment."contact_id" = contact."id"
      WHERE contact."organization_id" = NEW."organization_id"
        AND contact."id" = NEW."contact_id"
        AND contact."is_active" = true
        AND assignment."role_code" = NEW."counterparty_role_code"
        AND assignment."is_active" = true
    ) THEN
    RAISE EXCEPTION 'Purchase orders require an active vendor contact role'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "purchase_orders_contact_link_trigger"
  BEFORE INSERT OR UPDATE OF "organization_id", "vendor_id", "contact_id", "counterparty_role_code"
  ON "purchase_orders"
  FOR EACH ROW EXECUTE FUNCTION "link_purchase_order_contact"();

CREATE FUNCTION "link_merchandising_order_contact"() RETURNS TRIGGER AS $$
DECLARE
  resolved_contact_id TEXT;
  resolved_role_code VARCHAR(40);
  matching_buyers INTEGER;
  should_resolve BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_resolve := TRUE;
  ELSE
    should_resolve := NEW."buyer" IS DISTINCT FROM OLD."buyer"
      OR NEW."contact_id" IS DISTINCT FROM OLD."contact_id";
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."buyer" IS DISTINCT FROM OLD."buyer" THEN
    NEW."contact_id" := NULL;
    NEW."counterparty_role_code" := NULL;
  END IF;
  IF NEW."contact_id" IS NULL AND NEW."buyer" IS NOT NULL AND should_resolve THEN
    SELECT count(*) INTO matching_buyers
    FROM "master_buyers" buyer
    WHERE buyer."organization_id" = NEW."organization_id"
      AND lower(trim(buyer."buyer_name")) = lower(trim(NEW."buyer"))
      AND buyer."is_active" = true;
    IF matching_buyers > 1 THEN
      RAISE EXCEPTION 'Sales order buyer name is ambiguous; select a unique active contact'
        USING ERRCODE = '23514';
    END IF;
    SELECT buyer."contact_id" INTO resolved_contact_id
    FROM "master_buyers" buyer
    WHERE buyer."organization_id" = NEW."organization_id"
      AND lower(trim(buyer."buyer_name")) = lower(trim(NEW."buyer"))
      AND buyer."is_active" = true
    LIMIT 1;
    IF resolved_contact_id IS NOT NULL THEN
      SELECT assignment."role_code" INTO resolved_role_code
      FROM "contact_role_assignments" assignment
      JOIN "contacts" contact
        ON contact."organization_id" = assignment."organization_id"
        AND contact."id" = assignment."contact_id"
      WHERE assignment."organization_id" = NEW."organization_id"
        AND assignment."contact_id" = resolved_contact_id
        AND assignment."is_active" = true
        AND contact."is_active" = true
        AND assignment."role_code" IN ('CUSTOMER', 'DEALER', 'DISTRIBUTOR')
      ORDER BY CASE assignment."role_code"
        WHEN 'CUSTOMER' THEN 1
        WHEN 'DEALER' THEN 2
        ELSE 3
      END
      LIMIT 1;
      IF resolved_role_code IS NULL THEN
        RAISE EXCEPTION 'Sales orders require an active customer, dealer, or distributor contact role'
          USING ERRCODE = '23514';
      END IF;
      NEW."contact_id" := resolved_contact_id;
      NEW."counterparty_role_code" := resolved_role_code;
    ELSE
      RAISE EXCEPTION 'Sales orders require a customer, dealer, or distributor contact selected from the master'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."contact_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "contacts" contact
    JOIN "contact_role_assignments" assignment
      ON assignment."organization_id" = contact."organization_id"
      AND assignment."contact_id" = contact."id"
    WHERE contact."organization_id" = NEW."organization_id"
      AND contact."id" = NEW."contact_id"
      AND contact."is_active" = true
      AND assignment."role_code" = NEW."counterparty_role_code"
      AND assignment."role_code" IN ('CUSTOMER', 'DEALER', 'DISTRIBUTOR')
      AND assignment."is_active" = true
      AND EXISTS (
        SELECT 1 FROM "master_buyers" buyer
        WHERE buyer."organization_id" = NEW."organization_id"
          AND buyer."contact_id" = NEW."contact_id"
          AND buyer."is_active" = true
      )
  ) THEN
    RAISE EXCEPTION 'Sales orders require an active customer, dealer, or distributor contact role'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "merchandising_orders_contact_link_trigger"
  BEFORE INSERT OR UPDATE OF "organization_id", "buyer", "contact_id", "counterparty_role_code"
  ON "merchandising_orders"
  FOR EACH ROW EXECUTE FUNCTION "link_merchandising_order_contact"();
