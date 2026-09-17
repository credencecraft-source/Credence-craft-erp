ALTER TABLE "master_vendors"
ADD COLUMN "registered_state_id" TEXT;

CREATE TABLE "master_states" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_states_value_id_key" ON "master_states"("value_id");
CREATE UNIQUE INDEX "master_states_organization_id_state_key" ON "master_states"("organization_id", "state");
CREATE INDEX "master_states_organization_id_is_active_idx" ON "master_states"("organization_id", "is_active");
ALTER TABLE "master_states" ADD CONSTRAINT "master_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_vendors" ADD CONSTRAINT "master_vendors_registered_state_id_fkey" FOREIGN KEY ("registered_state_id") REFERENCES "master_states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH states(state, sort_order) AS (VALUES
  ('Andhra Pradesh', 0), ('Arunachal Pradesh', 1), ('Assam', 2), ('Bihar', 3), ('Chhattisgarh', 4), ('Goa', 5), ('Gujarat', 6), ('Haryana', 7), ('Himachal Pradesh', 8), ('Jammu and Kashmir', 9), ('Jharkhand', 10), ('Karnataka', 11), ('Kerala', 12), ('Ladakh', 13), ('Lakshadweep', 14), ('Madhya Pradesh', 15), ('Maharashtra', 16), ('Manipur', 17), ('Meghalaya', 18), ('Mizoram', 19), ('Nagaland', 20), ('Odisha', 21), ('Puducherry', 22), ('Punjab', 23), ('Rajasthan', 24), ('Sikkim', 25), ('Tamil Nadu', 26), ('Telangana', 27), ('Tripura', 28), ('Uttar Pradesh', 29), ('Uttarakhand', 30), ('West Bengal', 31), ('Andaman and Nicobar Islands', 32), ('Chandigarh', 33), ('Dadra and Nagar Haveli and Daman and Diu', 34), ('Delhi', 35)
)
INSERT INTO "master_states" ("id", "value_id", "organization_id", "state", "is_active", "sort_order", "updated_at")
SELECT 'state-' || md5(o.id || '-' || states.state), gen_random_uuid()::text, o.id, states.state, true, states.sort_order, CURRENT_TIMESTAMP
FROM "organizations" o CROSS JOIN states
ON CONFLICT ("organization_id", "state") DO NOTHING;