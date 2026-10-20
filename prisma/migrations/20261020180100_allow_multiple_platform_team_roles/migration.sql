DROP INDEX "platform_admins_manager_id_team_role_key";

CREATE INDEX "platform_admins_manager_id_team_role_idx"
ON "platform_admins"("manager_id", "team_role");
