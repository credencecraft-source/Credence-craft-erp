ALTER TABLE "workspace_users"
ALTER COLUMN "email" DROP NOT NULL;

UPDATE "workspace_users"
SET "email" = NULL
WHERE "email" LIKE '%@mobile.credencecraft.invalid';
