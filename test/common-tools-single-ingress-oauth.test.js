"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("single-ingress Apply hardens the closed realm and reconciles the native loopback OAuth client after runtime readiness", () => {
  const deploy = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-deploy.ps1"), "utf8");
  assert.match(deploy, /function Synchronize-SingleIngressMcpOAuthClient/);
  assert.match(deploy, /team keycloak-realm --base-url "http:\/\/127\.0\.0\.1:\$keycloakPort\/id" --apply --backup-file \$realmBackupFile --evidence-file \$realmEvidenceFile/);
  assert.match(deploy, /team keycloak-mcp-client --base-url "http:\/\/127\.0\.0\.1:\$keycloakPort\/id" --apply --backup-file \$clientBackupFile/);
  const applySequence = [
    "Assert-LocalRuntime @($deploymentPlan.capabilities)",
    "Synchronize-SingleIngressMcpOAuthClient",
    "Assert-SingleIngressRuntime @($deploymentPlan.capabilities)",
    "Invoke-Compose @('ps', '--format', 'json')",
  ];
  let cursor = 0;
  for (const marker of applySequence) {
    const markerIndex = deploy.indexOf(marker, cursor);
    assert.ok(
      markerIndex >= cursor,
      `Apply should execute ${JSON.stringify(marker)} after the preceding ingress step`,
    );
    cursor = markerIndex + marker.length;
  }
  assert.match(deploy, /artifacts\/keycloak-mcp-client-backups/);
  assert.match(deploy, /artifacts\/keycloak-realm-evidence/);
});
