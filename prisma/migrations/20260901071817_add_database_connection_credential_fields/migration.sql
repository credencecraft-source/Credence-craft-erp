-- AlterTable
ALTER TABLE "database_connections" ADD COLUMN     "connection_string" VARCHAR(1000),
ADD COLUMN     "database_name" VARCHAR(255),
ADD COLUMN     "host" VARCHAR(255),
ADD COLUMN     "port" INTEGER,
ADD COLUMN     "username" VARCHAR(255);
