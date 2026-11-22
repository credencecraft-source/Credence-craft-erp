import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(resolve(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8");
}

describe("production data-preserving migration safeguards", () => {
  it("keeps Stage 1 additive and Stage 2 enforcement migrations cleanly separated", () => {
    const stage1Schema = readMigration("20261122100000_stage1_hardening_schema");
    const stage1Ledger = readMigration("20261122110000_stage1_live_reconciliation");
    const stage2Names = [
      "20261122120000_stage2_stock_checks",
      "20261122130000_stage2_composite_fks",
      "20261122140000_stage2_restrict_rules",
      "20261122150000_stage2_finance_immutability",
      "20261122160000_stage2_append_only_audit",
      "20261122170000_stage2_rls_policies",
    ];
    const stage2Sql = stage2Names.map(readMigration).join("\n");

    expect(stage1Schema).not.toMatch(/ADD CONSTRAINT.*CHECK|ADD CONSTRAINT.*FOREIGN KEY|ENABLE ROW LEVEL SECURITY|BEFORE UPDATE OR DELETE|ON DELETE RESTRICT/i);
    expect(stage1Schema).toMatch(/ADD COLUMN IF NOT EXISTS "organization_id"/i);
    expect(stage1Ledger).toMatch(/LIVE_RECONCILIATION/i);
    expect(stage1Ledger).toMatch(/before_qty/i);
    expect(stage1Ledger).toMatch(/after_qty/i);
    expect(stage1Ledger).toMatch(/idempotency_key/i);

    expect(stage2Sql).toMatch(/reserved_lte_on_hand_check/i);
    expect(stage2Sql).toMatch(/FOREIGN KEY \("organization_id"/i);
    expect(stage2Sql).toMatch(/ON DELETE RESTRICT/i);
    expect(stage2Sql).toMatch(/prevent_posted_finance_mutation/i);
    expect(stage2Sql).toMatch(/stock_movements_immutable/i);
    expect(stage2Sql).toMatch(/audit_events_append_only_update/i);
    expect(stage2Sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("includes ledger, stock, finance, RLS, audit, and child-isolation hardening", () => {
    const stage1 = readMigration("20261122100000_stage1_hardening_schema");
    const reconciliation = readMigration("20261122110000_stage1_live_reconciliation");
    const stage2 = [
      "20261122120000_stage2_stock_checks",
      "20261122130000_stage2_composite_fks",
      "20261122140000_stage2_restrict_rules",
      "20261122150000_stage2_finance_immutability",
      "20261122160000_stage2_append_only_audit",
      "20261122170000_stage2_rls_policies",
    ].map(readMigration).join("\n");
    expect(stage1).toMatch(/CREATE TABLE "stock_movements"/i);
    expect(stage1).toMatch(/ADD COLUMN IF NOT EXISTS "organization_id"/i);
    expect(reconciliation).toMatch(/LIVE_RECONCILIATION/i);
    expect(stage2).toMatch(/stock_movements_immutable/i);
    expect(stage2).toMatch(/reserved_lte_on_hand_check/i);
    expect(stage2).toMatch(/prevent_posted_finance_mutation/i);
    expect(stage2).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(stage2).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(stage2).toMatch(/before_data/i);
    expect(stage2).toMatch(/after_data/i);
    expect(stage2).toMatch(/changed_fields/i);
    expect(stage2).toMatch(/audit_events_append_only_update/i);
  });
  it("rejects unguarded destructive DDL in migrations newer than the historical allowlist", () => {
    const migrationsRoot = resolve(process.cwd(), "prisma", "migrations");
    const historicalAllowlist = new Set([
      "20260901125809_split_raw_material_classification_masters",
      "20260910000000_add_organization_memberships",
      "20260910000300_remove_business_type_module_key",
      "20260912010000_make_organization_roles_dynamic",
      "20260914130000_migrate_plan_restrictions_to_version_segments",
      "20260923110000_skip_audit_during_organization_delete",
      "20261002120000_add_dummy_data_workflow_stages",
      "20261006120000_add_platform_tag_master",
    ]);

    for (const name of readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name >= "20261122100000_stage1_hardening_schema")
      .filter((name) => {
        try {
          readMigration(name);
          return true;
        } catch {
          return false;
        }
      })) {
      if (historicalAllowlist.has(name)) continue;
      const sql = readMigration(name);
      expect(sql, `New migration ${name} contains unguarded DROP TABLE`).not.toMatch(/DROP TABLE/i);
      expect(sql, `New migration ${name} contains unguarded DROP COLUMN`).not.toMatch(/DROP COLUMN/i);
      expect(sql, `New migration ${name} contains unguarded TRUNCATE`).not.toMatch(/TRUNCATE/i);
      if (/ALTER COLUMN[^;]*TYPE/i.test(sql)) {
        expect(sql, `New migration ${name} must annotate reviewed type changes`).toMatch(/SAFETY REVIEWED|DATA TYPE MIGRATION REVIEWED/i);
      }
    }
  });
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
