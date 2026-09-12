ALTER TABLE "database_connections"
  ADD COLUMN "connection_string_encrypted" VARCHAR(2000),
  ADD COLUMN "username_encrypted" VARCHAR(2000);