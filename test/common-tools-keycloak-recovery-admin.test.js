"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("Keycloak recovery admin script is confirmation-gated, volume-scoped, and restores service state", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-recovery-admin.ps1"), "utf8");
  assert.match(script, /SupportsShouldProcess = \$true/);
  assert.match(script, /ConfirmImpact = 'High'/);
  assert.match(script, /\[string\]\$RecoveryAdminUsername = 'recovery-admin'/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$ids = @\(Invoke-Docker/);
  assert.match(script, /\$details = @\(Invoke-Docker/);
  assert.match(script, /\$status = @\(Invoke-Docker/);
  assert.match(script, /docker.*ps.*label=com\.docker\.compose\.project/s);
  assert.match(script, /destination "\/opt\/keycloak\/data"/i);
  assert.match(script, /quay\\\.io\/keycloak\/keycloak/);
  assert.match(script, /bootstrap-admin', 'user'/);
  assert.match(script, /--password:env/);
  assert.doesNotMatch(script, /\$recoveryPasswordName=\$password/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--security-opt', 'no-new-privileges:true'/);
  assert.match(script, /team-keycloak-mcp-client-sync\.ps1/);
  assert.match(script, /if \(\$null -ne \$container -and \$stopped\)/);
  assert.doesNotMatch(script, /docker volume rm|Remove-Item|docker compose down/);
});
