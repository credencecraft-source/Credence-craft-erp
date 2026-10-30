WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, dealer_id
      ORDER BY created_at ASC, id ASC
    ) AS assignment_rank
  FROM "contact_distributor_dealer_assignments"
)
DELETE FROM "contact_distributor_dealer_assignments" assignment
USING ranked
WHERE assignment.id = ranked.id
  AND ranked.assignment_rank > 1;

CREATE UNIQUE INDEX "contact_distributor_dealer_org_dealer_key"
ON "contact_distributor_dealer_assignments"("organization_id", "dealer_id");
