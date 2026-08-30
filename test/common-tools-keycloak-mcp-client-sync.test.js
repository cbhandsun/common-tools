"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("standalone Keycloak MCP client sync is lock-protected, credential-minimal, and non-destructive", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-mcp-client-sync.ps1"), "utf8");
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /\[int\]\$KeycloakPort = 58080/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD/);
  assert.doesNotMatch(script, /COMMON_TOOLS_POSTGRES_PASSWORD|COMMON_TOOLS_REDIS_PASSWORD|COMMON_TOOLS_MINIO_PASSWORD/);
  assert.match(script, /team keycloak-realm --base-url "http:\/\/127\.0\.0\.1:\$KeycloakPort\/id" --apply --backup-file \$realmBackupFile --evidence-file \$realmEvidenceFile/);
  assert.match(script, /team keycloak-mcp-client --base-url "http:\/\/127\.0\.0\.1:\$KeycloakPort\/id" --apply --backup-file \$clientBackupFile/);
  assert.match(script, /artifacts\/keycloak-realm-evidence/);
  assert.match(script, /artifacts\/keycloak-mcp-client-backups/);
  assert.match(script, /foreach \(\$name in \$promptedEnvironmentNames\) \{ \[Environment\]::SetEnvironmentVariable\(\$name, \$null, 'Process'\) \}/);
  assert.doesNotMatch(script, /docker compose|Remove-Item|docker volume/);
});
