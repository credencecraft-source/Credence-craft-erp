-- CreateTable
CREATE TABLE "master_size_group_sizes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "size_group_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_size_group_sizes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_size_group_sizes_size_group_id_size_id_key" ON "master_size_group_sizes"("size_group_id", "size_id");
CREATE INDEX "master_size_group_sizes_organization_id_size_group_id_idx" ON "master_size_group_sizes"("organization_id", "size_group_id");
CREATE INDEX "master_size_group_sizes_organization_id_size_id_idx" ON "master_size_group_sizes"("organization_id", "size_id");

INSERT INTO "master_size_group_sizes" ("id", "organization_id", "size_group_id", "size_id")
SELECT 'legacy-' || ms.id, ms.organization_id, ms.size_group_id, ms.id
FROM "master_sizes" ms
WHERE ms.size_group_id IS NOT NULL
ON CONFLICT ("size_group_id", "size_id") DO NOTHING;

ALTER TABLE "master_size_group_sizes" ADD CONSTRAINT "master_size_group_sizes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_size_group_sizes" ADD CONSTRAINT "master_size_group_sizes_size_group_id_fkey" FOREIGN KEY ("size_group_id") REFERENCES "master_size_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_size_group_sizes" ADD CONSTRAINT "master_size_group_sizes_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "master_sizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;