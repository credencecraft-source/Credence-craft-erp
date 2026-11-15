import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(resolve(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8");
}

describe("production data-preserving migration safeguards", () => {
  it("allows unmapped inventory rows to remain nullable and retains their warehouse values", () => {
    const sql = readMigration("20260930190000_location_based_inventory");

    expect(sql).toMatch(/ALTER COLUMN "entity_id" DROP NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN "location_id" DROP NOT NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "warehouse"/i);
    expect(sql).not.toMatch(/RAISE EXCEPTION/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/SET NOT NULL/i);
  });

  it("does not drop or delete existing distributor-dealer assignments", () => {
    const createMappingSql = readMigration("20261029234300_add_distributor_dealer_mapping");
    const relaxUniquenessSql = readMigration("20261030005000_unique_distributor_dealer");

    expect(createMappingSql).toMatch(/CREATE TABLE IF NOT EXISTS/i);
    expect(createMappingSql).not.toMatch(/DROP TABLE/i);
    expect(createMappingSql).not.toMatch(/DELETE\s+FROM\s+"contact_distributor_dealer_assignments"/i);
    expect(relaxUniquenessSql).not.toMatch(/DROP TABLE/i);
    expect(relaxUniquenessSql).not.toMatch(/DELETE\s+FROM\s+"contact_distributor_dealer_assignments"/i);
  });

  it("preserves quotation lines without a source booking", () => {
    const sql = readMigration("20261007122500_use_advance_bookings_as_quotation_lines");

    expect(sql).toMatch(/ALTER COLUMN "source_booking_id" DROP NOT NULL/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "size"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"distribution_quotation_lines"/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/SET NOT NULL/i);
  });

  it("renames the legacy plan limit only when safe and never drops its stored value", () => {
    const sql = readMigration("20260923100000_remove_plan_order_quantity_limit");

    expect(sql).toMatch(/IF EXISTS/i);
    expect(sql).toMatch(/RENAME COLUMN "max_order_qty" TO "legacy_max_order_qty"/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });
});
