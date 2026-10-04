CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');
CREATE TYPE "PlatformTeamRole" AS ENUM ('CMO', 'CTO');

ALTER TABLE "platform_admins"
ADD COLUMN "mobile_number" VARCHAR(20),
ADD COLUMN "role" "PlatformAdminRole",
ADD COLUMN "team_role" "PlatformTeamRole",
ADD COLUMN "manager_id" TEXT;

UPDATE "platform_admins"
SET "role" = CASE
  WHEN "id" = (
    SELECT "id"
    FROM "platform_admins"
    ORDER BY "is_active" DESC, "created_at" ASC, "id" ASC
    LIMIT 1
  ) THEN 'SUPER_ADMIN'::"PlatformAdminRole"
  ELSE 'ADMIN'::"PlatformAdminRole"
END;

ALTER TABLE "platform_admins"
ALTER COLUMN "role" SET DEFAULT 'SUPER_ADMIN',
ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "platform_admins"
ADD CONSTRAINT "platform_admins_manager_id_fkey"
FOREIGN KEY ("manager_id") REFERENCES "platform_admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "platform_admins_manager_id_team_role_key"
ON "platform_admins"("manager_id", "team_role");

CREATE INDEX "platform_admins_manager_id_role_is_active_idx"
ON "platform_admins"("manager_id", "role", "is_active");
