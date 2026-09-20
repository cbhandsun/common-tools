"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("OCR overlays expose an optional checkpoint revision without enabling it by default", () => {
  for (const name of ["compose.team-image-ocr.yaml", "compose.team-image-paddleocr.yaml"]) {
    const source = fs.readFileSync(path.resolve("deploy", name), "utf8");
    const worker = serviceBlock(source, "image-to-editable-worker");
    assert.ok(worker.includes('COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION: ${COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION:-}'));
  }
});

function serviceBlock(source, name) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`service ${name} was not found`);
  const output = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^  [a-z][a-z0-9-]*:$/.test(lines[index])) break;
    output.push(lines[index]);
  }
  return output.join("\n");
}

function canonicalPathForComparison(filePath) {
  const absolute = path.resolve(filePath);
  if (fs.existsSync(absolute)) return fs.realpathSync.native(absolute);
  return path.join(fs.realpathSync.native(path.dirname(absolute)), path.basename(absolute));
}

test("team Compose applies restart and resource limits to untrusted execution services", () => {
  const root = path.resolve(__dirname, "..");
  const api = fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8");
  const gateway = fs.readFileSync(path.join(root, "deploy", "compose.team-gateway.yaml"), "utf8");
  for (const [name, expected] of [["remote-mcp", ["cpus: \"1.0\"", "mem_limit: 768m", "pids_limit: 256"]], ["team-retention", ["cpus: \"0.25\"", "mem_limit: 256m", "pids_limit: 128", "team-maintenance"]], ["project-audit-worker", ["cpus: \"1.0\"", "mem_limit: 1g", "pids_limit: 256"]], ["ppt-quality-worker", ["cpus: \"1.0\"", "mem_limit: 512m", "pids_limit: 128", "team-worker-ppt-quality"]], ["ppt-improve-worker", ["cpus: \"1.0\"", "mem_limit: 768m", "pids_limit: 128", "team-worker-ppt-improve"]], ["ppt-create-worker", ["cpus: \"1.5\"", "mem_limit: 2g", "pids_limit: 256", "team-worker-ppt-create"]], ["image-to-editable-worker", ["cpus: \"2.0\"", "mem_limit: 3g", "pids_limit: 256"]]]) {
    const block = serviceBlock(api, name);
    assert.match(block, /restart: unless-stopped/);
    if (name !== "remote-mcp") assert.match(block, /stop_grace_period: 60s/);
    for (const entry of expected) assert.equal(block.includes(entry), true);
    assert.match(block, /read_only: true/);
    assert.match(block, /cap_drop: \["ALL"\]/);
    assert.match(block, /COMMON_TOOLS_TEAM_CAPABILITIES: \$\{COMMON_TOOLS_TEAM_CAPABILITIES:-image-to-editable,project-audit\}/);
  }
  const gatewayBlock = serviceBlock(gateway, "remote-mcp-gateway");
  assert.match(serviceBlock(api, "image-to-editable-worker"), /tmpfs: \["\/tmp:rw,noexec,nosuid,size=256m"\]/);
  assert.match(gatewayBlock, /restart: unless-stopped/);
  assert.match(gatewayBlock, /healthcheck:/);
  assert.match(gatewayBlock, /wget -q -O \/dev\/null http:\/\/127\.0\.0\.1:8080\/readyz \|\| exit 1/);
  assert.match(gatewayBlock, /interval: 10s/);
  assert.match(gatewayBlock, /timeout: 5s/);
  assert.match(gatewayBlock, /retries: 12/);
  assert.match(gatewayBlock, /cpus: "0\.5"/);
  assert.match(gatewayBlock, /mem_limit: 128m/);
  assert.match(gatewayBlock, /pids_limit: 64/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_ARTIFACT_RETENTION_DAYS: \$\{COMMON_TOOLS_ARTIFACT_RETENTION_DAYS:-30\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: \$\{COMMON_TOOLS_RETENTION_INTERVAL_SECONDS:-86400\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS: \$\{COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS:-10000\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: \$\{COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_OTEL_SERVICE_NAME: \$\{COMMON_TOOLS_OTEL_SERVICE_NAME:-\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS: \$\{COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS:-\}/);
  assert.match(serviceBlock(api, "remote-mcp"), /COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME: \$\{COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME:-AI 助手笔记\}/u);
  for (const name of ["project-audit-worker", "ppt-create-worker", "ppt-quality-worker", "ppt-improve-worker", "image-to-editable-worker"]) {
    const worker = serviceBlock(api, name);
    assert.match(worker, /COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: \$\{COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:-\}/);
    assert.match(worker, /COMMON_TOOLS_OTEL_SERVICE_NAME: \$\{COMMON_TOOLS_OTEL_SERVICE_NAME:-\}/);
    assert.match(worker, /COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS: \$\{COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS:-\}/);
  }
  assert.match(serviceBlock(gateway, "remote-mcp"), /ports: !reset \[\]/);
  const migrate = serviceBlock(api, "team-migrate");
  assert.match(migrate, /common-tools-team-migrate\.js/);
  assert.match(migrate, /restart: "no"/);
  assert.match(migrate, /cpus: "0\.25"/);
  assert.match(migrate, /mem_limit: 256m/);
  assert.match(migrate, /read_only: true/);
  assert.match(migrate, /cap_drop: \["ALL"\]/);
  const retention = serviceBlock(api, "team-retention");
  assert.match(retention, /common-tools-team-retention-scheduler\.js/);
  assert.match(retention, /COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: \$\{COMMON_TOOLS_RETENTION_INTERVAL_SECONDS:-86400\}/);
  for (const name of ["remote-mcp", "team-retention", "project-audit-worker", "ppt-create-worker", "ppt-quality-worker", "ppt-improve-worker", "image-to-editable-worker"]) assert.match(serviceBlock(api, name), /team-migrate: \{ condition: service_completed_successfully \}/);
});

test("production Compose override requires managed endpoints and disables direct API port publishing", () => {
  const root = path.resolve(__dirname, "..");
  const production = fs.readFileSync(path.join(root, "deploy", "compose.team-production.yaml"), "utf8");
  const secretFiles = fs.readFileSync(path.join(root, "deploy", "compose.team-production-secrets.yaml"), "utf8");
  assert.match(production, /NODE_ENV: production/);
  assert.match(production, /COMMON_TOOLS_TEAM_MODE: production/);
  assert.match(production, /COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true"/);
  assert.match(production, /COMMON_TOOLS_REMOTE_IMAGE:\?set immutable remote API image reference/);
  assert.match(production, /COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME: \$\{COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME:-AI 助手笔记\}/u);
  assert.match(production, /COMMON_TOOLS_IMAGE_WORKER_IMAGE:-/);
  assert.match(production, /COMMON_TOOLS_OBJECT_STORE_ENDPOINT:\?set HTTPS object-store endpoint/);
  assert.match(production, /managed PostgreSQL URL without credentials/);
  assert.match(production, /managed Redis URL without credentials/);
  assert.match(production, /ports: !reset \[\]/);
  assert.equal((production.match(/build: !reset null/g) || []).length, 8);
  const migration = serviceBlock(production, "team-migrate");
  assert.match(migration, /COMMON_TOOLS_TEAM_MODE: production/);
  assert.match(migration, /COMMON_TOOLS_DATABASE_URL:\s+\$\{COMMON_TOOLS_DATABASE_URL/);
  for (const name of ["remote-mcp", "team-retention", "project-audit-worker", "ppt-create-worker", "ppt-quality-worker", "ppt-improve-worker", "image-to-editable-worker"]) {
    assert.match(serviceBlock(production, name), /depends_on: !override\s+team-migrate: \{ condition: service_completed_successfully \}/);
  }
  assert.equal((production.match(/team-migrate: \{ condition: service_completed_successfully \}/g) || []).length, 7);
  assert.doesNotMatch(production, /keycloak|127\.0\.0\.1|COMMON_TOOLS_KEYCLOAK/i);
  assert.match(secretFiles, /COMMON_TOOLS_DATABASE_PASSWORD_FILE:\?set database password secret file/);
  assert.match(secretFiles, /COMMON_TOOLS_DATABASE_PASSWORD_FILE: \/run\/secrets\/common_tools_database_password/);
  assert.match(serviceBlock(secretFiles, "ppt-quality-worker"), /common_tools_object_store_secret_access_key/);
  assert.match(serviceBlock(secretFiles, "ppt-improve-worker"), /common_tools_object_store_secret_access_key/);
  assert.match(serviceBlock(secretFiles, "ppt-create-worker"), /common_tools_object_store_secret_access_key/);
  assert.match(serviceBlock(secretFiles, "team-retention"), /common_tools_object_store_secret_access_key/);
  assert.match(secretFiles, /COMMON_TOOLS_DATABASE_PASSWORD: !reset null/);
});

test("team infrastructure survives a Docker engine restart without exposing extra privileges", () => {
  const root = path.resolve(__dirname, "..");
  const infrastructure = fs.readFileSync(path.join(root, "deploy", "compose.team-infra.yaml"), "utf8");
  for (const name of ["postgres", "redis", "minio"]) {
    const block = serviceBlock(infrastructure, name);
    assert.match(block, /restart: unless-stopped/);
  }
  const idp = fs.readFileSync(path.join(root, "deploy", "compose.team-idp.yaml"), "utf8");
  assert.match(serviceBlock(idp, "keycloak"), /restart: unless-stopped/);
  assert.match(serviceBlock(idp, "keycloak"), /common-tools-keycloak:\/opt\/keycloak\/data/);
  assert.match(idp, /volumes:\s+common-tools-keycloak:/);
});

test("Keycloak persistence migration is explicit, data-preserving, and cannot read container configuration", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-persistence-migrate.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{(?:.|\r|\n)*?Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD/);
  assert.match(script, /\$dataMounts = @\(Read-KeycloakDataMount \$container\.Id\)/);
  assert.match(script, /\$currentDataMounts = @\(Read-KeycloakDataMount \$current\.Id\)/);
  assert.match(script, /\$mounts = \$raw \| ConvertFrom-Json -ErrorAction Stop/);
  assert.match(script, /Test-DockerVolumeExists -Name \$targetVolume/);
  assert.match(script, /Invoke-Docker @\('stop', '--time', '60', \$originalContainerId\)/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--read-only'/);
  assert.match(script, /--cap-drop', 'ALL'/);
  assert.match(script, /cp -a \/opt\/keycloak\/data\/\. \/target\//);
  assert.match(script, /--force-recreate', 'keycloak'/);
  assert.doesNotMatch(script, /docker inspect .*Config\.Env/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("MinIO volume backup is explicit, isolated, and never overwrites a destination volume", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-minio-volume-backup.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /Backup volume already exists; refusing to overwrite it/);
  assert.match(script, /Test-DockerVolumeExists -Name \$Name/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--read-only'/);
  assert.match(script, /type=volume,source=\$sourceVolume,target=\/source,readonly/);
  assert.match(script, /cp -a \/source\/\. \/target\//);
  assert.match(script, /\$mustStopBeforeCopy = \$minio\.State -in @\('running', 'restarting'\)/);
  assert.match(script, /\$shouldRestart = \$minio\.State -eq 'running'/);
  assert.doesNotMatch(script, /volume', 'rm'/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("Keycloak volume backup is explicit, isolated, and preserves the original volume", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-volume-backup.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /Backup volume already exists; refusing to overwrite it/);
  assert.match(script, /Test-DockerVolumeExists -Name \$Name/);
  assert.match(script, /label=com\.docker\.compose\.service=keycloak/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--read-only'/);
  assert.match(script, /type=volume,source=\$sourceVolume,target=\/source,readonly/);
  assert.match(script, /cp -a \/source\/\. \/target\//);
  assert.match(script, /\$mustStopBeforeCopy = \$keycloak\.State -in @\('running', 'restarting'\)/);
  assert.match(script, /\$shouldRestart = \$keycloak\.State -eq 'running'/);
  assert.doesNotMatch(script, /volume', 'rm'/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("Keycloak restore drill restores only a backup into isolated temporary resources", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-volume-restore-drill.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /SourceVolume must name a project-scoped Keycloak backup volume, not the live volume/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Test-DockerVolumeExists -Name \$SourceVolume/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--read-only'/);
  assert.match(script, /type=volume,source=\$SourceVolume,target=\/source,readonly/);
  assert.match(script, /cp -a \/source\/\. \/target\//);
  assert.match(script, /KC_BOOTSTRAP_ADMIN_PASSWORD=\$bootstrapPassword/);
  assert.match(script, /\/health\/ready/);
  assert.match(script, /docker rm '--force' \$targetContainer/);
  assert.match(script, /docker volume rm \$targetVolume/);
  assert.doesNotMatch(script, /docker inspect .*Config\.Env/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("PostgreSQL volume backup is explicit, isolated, and preserves the original volume", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-postgres-volume-backup.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Backup volume already exists; refusing to overwrite it/);
  assert.match(script, /Test-DockerVolumeExists -Name \$Name/);
  assert.match(script, /label=com\.docker\.compose\.service=postgres/);
  assert.match(script, /--network', 'none'/);
  assert.match(script, /--read-only'/);
  assert.match(script, /type=volume,source=\$sourceVolume,target=\/source,readonly/);
  assert.match(script, /cp -a \/source\/\. \/target\//);
  assert.match(script, /\$mustStopBeforeCopy = \$postgres\.State -in @\('running', 'restarting'\)/);
  assert.match(script, /\$shouldRestart = \$postgres\.State -eq 'running'/);
  assert.doesNotMatch(script, /volume', 'rm'/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("fresh local reset requires one password and only removes declared project volumes", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-fresh-reset.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Fresh local reset requires one shared local password/);
  assert.match(script, /\[switch\]\$PromptForSecrets/);
  assert.match(script, /function Read-SecretValue/);
  assert.match(script, /function Set-MissingFreshResetPassword/);
  assert.match(script, /function Set-MissingLocalDatabasePassword/);
  assert.match(script, /COMMON_TOOLS_DATABASE_PASSWORD/);
  assert.match(script, /Shared fresh local reset password/);
  assert.match(script, /Fresh local reset password must contain at least 8 characters/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN = 'local-admin'/);
  assert.match(script, /Invoke-FreshCompose @\('down', '--volumes'\)/);
  assert.doesNotMatch(script, /Invoke-FreshCompose @\('down', '--volumes', '--remove-orphans'\)/);
  assert.match(script, /team-runtime-local-deploy\.ps1/);
  assert.match(script, /-DiscoverLocalPorts/);
  assert.match(script, /-EnableIdentityProvider/);
  assert.match(script, /function Set-MissingLocalMinioPorts/);
  assert.match(script, /Test-LoopbackPortAvailable 59000/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(packageJson, /common-tools:team-local-fresh-reset/);
  assert.match(packageJson, /team-runtime-local-fresh-reset\.ps1 -Mode Apply -Confirm -PromptForSecrets/);
});

test("unified local password script writes secrets outside the repo and requires explicit state reset for redeploy", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-unified-password.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /\[string\]\$Project = 'common-tools-public'/);
  assert.match(script, /\[string\]\$KeycloakAdmin = 'common-tools-admin'/);
  assert.match(script, /\[switch\]\$Interactive/);
  assert.match(script, /\[switch\]\$PromptForPassword/);
  assert.match(script, /\[switch\]\$Redeploy/);
  assert.match(script, /\[switch\]\$ResetState/);
  assert.match(script, /\[switch\]\$ConfirmReset/);
  assert.match(script, /Secret file must be outside the repository root/);
  assert.match(script, /function New-SharedPassword/);
  assert.match(script, /function Read-YesNo/);
  assert.match(script, /function Read-ConfirmedSecretValue/);
  assert.match(script, /\$minimumSharedPasswordLength = 8/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /Input is hidden; type the value and press Enter/);
  assert.match(script, /Shared password must contain at least \$minimumSharedPasswordLength characters/);
  assert.match(script, /Confirm new shared Common Tools password/);
  assert.match(script, /Shared password confirmation did not match; please try again\./);
  assert.match(script, /while \(\$true\)/);
  assert.match(script, /COMMON_TOOLS_SHARED_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_POSTGRES_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_DATABASE_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_REDIS_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_MINIO_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_URL/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_PUBLIC_URL/);
  assert.match(script, /COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME/);
  assert.match(script, /COMMON_TOOLS_SIYUAN_TOKEN/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /if \(\$Mode -eq 'Plan'\)/);
  assert.match(script, /if \(\$Interactive\) \{/);
  assert.match(script, /\$PromptForPassword = \$true/);
  assert.match(script, /Reset local Docker state and redeploy project '\$Project' now so the new password takes effect\?/);
  assert.match(script, /This will remove Docker volumes for project '\$Project' before redeploying\. Continue\?/);
  assert.ok(script.indexOf("$interactiveSharedPassword = Read-ConfirmedSecretValue 'New shared Common Tools password'") < script.indexOf("Reset local Docker state and redeploy project '$Project' now so the new password takes effect?"));
  assert.match(script, /function Assert-RedeployResetSafety/);
  assert.match(script, /if \(\$ResetStateRequested -and \(-not \$RedeployRequested\)\) \{ throw '-ResetState requires -Redeploy' \}/);
  assert.match(script, /if \(\$ResetStateRequested -and \(-not \$ResetConfirmed\)\) \{ throw 'State reset requires -ConfirmReset' \}/);
  assert.match(script, /Redeploying with a new shared password requires -ResetState/);
  assert.match(script, /Assert-RedeployResetSafety \(\[bool\]\$Redeploy\) \(\[bool\]\$ResetState\) \(\[bool\]\$ConfirmReset\)/);
  assert.ok(script.indexOf("Assert-RedeployResetSafety ([bool]$Redeploy) ([bool]$ResetState) ([bool]$ConfirmReset)") < script.indexOf("Write-SecretFile $secretFile $values"));
  assert.match(script, /Remove-ComposeProjectContainers \$Project/);
  assert.match(script, /if \(\$ResetState\) \{ Remove-ComposeProjectVolumes \$Project \}/);
  assert.ok(script.indexOf("if ($Mode -eq 'Plan')") < script.indexOf("if ($Redeploy) {"));
  assert.ok(script.indexOf("if ($Redeploy) {") < script.indexOf("if ($ResetState) { Remove-ComposeProjectVolumes $Project }"));
  assert.match(script, /team-runtime-local-deploy\.ps1/);
  assert.match(packageJson, /scripts\/team-runtime-local-unified-password\.ps1/);
  assert.match(packageJson, /common-tools:team-local-unified-password/);
  assert.match(packageJson, /team-runtime-local-unified-password\.ps1 -Interactive/);
});

test("local team deployment script preflights configuration and keeps the migration gate intact", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-deploy.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /common-tools-docker-engine\.ps1/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{(?:.|\r|\n)*?Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /DockerEngineTimeoutSeconds = 20/);
  assert.match(script, /\[switch\]\$DiscoverLocalConfiguration/);
  assert.match(script, /\[switch\]\$DiscoverLocalPorts/);
  assert.match(script, /\[switch\]\$SeparatePasswords/);
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds/);
  assert.match(script, /Invoke-Compose @\('config', '--quiet'\)/);
  assert.match(script, /function Read-SecretValue/);
  assert.match(script, /function Set-MissingSharedLocalPassword/);
  assert.match(script, /function Set-MissingLocalDatabasePassword/);
  assert.match(script, /COMMON_TOOLS_DATABASE_PASSWORD = 'local-plan-placeholder'/);
  assert.match(script, /function Set-MissingPlanPlaceholderSecrets/);
  assert.match(script, /local-plan-placeholder/);
  assert.match(script, /Shared local deployment password/);
  assert.match(script, /Shared local deployment password must contain at least 8 characters/);
  assert.match(script, /if \(-not \$SeparatePasswords\)/);
  assert.match(script, /function Remove-LocalStatelessComposeContainers/);
  assert.match(script, /function Resolve-LocalStatelessDeploymentServices/);
  assert.match(script, /Team deployment plan did not include worker services/);
  assert.match(script, /'remote-mcp-gateway'/);
  assert.match(script, /'image-to-editable-worker'/);
  assert.match(script, /'ppt-create-worker'/);
  assert.match(script, /label=com\.docker\.compose\.project=\$Project/);
  assert.match(script, /label=com\.docker\.compose\.service=\$service/);
  assert.match(script, /Refusing to clean a container with Docker volume mounts/);
  assert.match(script, /docker rm --force @safeIds/);
  assert.match(script, /Remove-LocalStatelessComposeContainers @\(Resolve-LocalStatelessDeploymentServices \$deploymentPlan\)/);
  assert.match(script, /Invoke-Compose @\('up', '--detach', '--build', '--remove-orphans', '--wait'/);
  assert.match(script, /Invoke-Compose @\('up', '--detach', '--remove-orphans', '--wait', '--wait-timeout', \$WaitTimeoutSeconds, 'minio'\)/);
  assert.match(script, /A root-password mismatch must not trigger a costly partial rollout/);
  assert.match(script, /'deployment-plan'/);
  assert.match(script, /team local-config --project \$Project/);
  assert.match(script, /\[Environment\]::SetEnvironmentVariable\(\$name, \$value\.Trim\(\), 'Process'\)/);
  assert.match(script, /function Set-MissingLocalObjectStorePublicEndpoint/);
  assert.match(script, /\$existingUri = \[Uri\]\$existing/);
  assert.match(script, /\$existingUri\.Port -eq \[int\]\$apiPort/);
  assert.match(script, /COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT', "http:\/\/127\.0\.0\.1:\$apiPort"/);
  assert.match(script, /if \(\$DiscoverLocalConfiguration\) \{\s+Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds\s+\$dockerEngineChecked = \$true\s+Set-MissingLocalConfiguration/s);
  assert.match(script, /if \(-not \$dockerEngineChecked\) \{ Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds \}/);
  assert.match(script, /function Set-MissingLocalMinioPorts/);
  assert.match(script, /function Set-MissingLocalRemotePort/);
  assert.match(script, /\[switch\]\$EnableIdentityProvider/);
  assert.match(script, /Test-LoopbackPortAvailable 59000/);
  assert.match(script, /Test-LoopbackPortAvailable 54000/);
  assert.match(script, /Get-Random -Minimum 20000 -Maximum 65535/);
  assert.match(script, /COMMON_TOOLS_MINIO_CONSOLE_PORT/);
  assert.match(script, /COMMON_TOOLS_REMOTE_PORT/);
  assert.match(script, /localRemotePort = \[Environment\]::GetEnvironmentVariable\('COMMON_TOOLS_REMOTE_PORT', 'Process'\)/);
  assert.match(script, /Read-DeploymentPlan/);
  assert.match(script, /function Assert-LocalRuntime/);
  assert.match(script, /team runtime --project \$Project --capabilities \(\$Capabilities -join ','\) --require-gateway/);
  assert.match(script, /Assert-LocalRuntime @\(\$deploymentPlan\.capabilities\)/);
  assert.match(script, /function Assert-SingleIngressRuntime/);
  assert.match(script, /team-runtime-doctor\.js/);
  assert.match(script, /--allow-remote/);
  assert.match(script, /--expected-capabilities/);
  assert.match(script, /if \(\$EnableSingleIngress\) \{\s+Set-SingleIngressConfiguration \$SingleIngressPublicUrl\s+\$EnableIdentityProvider = \$true\s+\}/s);
  assert.match(script, /if \(\$EnableIdentityProvider\) \{\s+\$composeFiles \+= \(Join-Path \$repositoryRoot 'deploy\/compose\.team-idp\.yaml'\)\s+\$profiles \+= 'team-idp'\s+\}/s);
  assert.match(script, /Synchronize-SingleIngressMcpOAuthClient\s+Assert-SingleIngressRuntime @\(\$deploymentPlan\.capabilities\)/s);
  assert.match(script, /'team-maintenance'/);
  assert.match(script, /enabledCapabilities = @\(\$deploymentPlan\.capabilities\)/);
  assert.match(script, /workerProfiles = @\(\$deploymentPlan\.workerProfiles\)/);
  assert.match(script, /identityProviderEnabled = \[bool\]\$EnableIdentityProvider/);
  assert.doesNotMatch(script, /\$workerProfiles = @\{/);
  assert.match(script, /\$missingEnvironment = @\(\)/);
  assert.match(script, /\$missingEnvironment -join ', '/);
  assert.match(script, /COMMON_TOOLS_MINIO_PASSWORD must contain at least 8 characters/);
  assert.doesNotMatch(script, /Invoke-Compose @\([^\r\n]*--no-deps/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("local apply wrapper defaults non-secret Docker configuration and delegates secret prompts", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-apply.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /\[string\]\$Mode = 'Apply'/);
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /\[string\]\$KeycloakAdmin = 'local-admin'/);
  assert.match(script, /\[switch\]\$SeparatePasswords/);
  assert.match(script, /\[switch\]\$SkipSmoke/);
  assert.match(script, /\[switch\]\$EnableIdentityProvider/);
  assert.match(script, /'COMMON_TOOLS_REMOTE_PORT'/);
  assert.match(script, /function Select-LocalRemotePort/);
  assert.match(script, /Test-LoopbackPortAvailable 54000/);
  assert.match(script, /Could not find an available loopback port for the local remote MCP gateway/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_REMOTE_PORT' \$remotePort/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_REMOTE_PUBLIC_URL' \$remoteOrigin/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS' \$remoteOrigin/);
  assert.match(script, /function Set-DiscoveredLocalObjectStorePublicEndpoint/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT' \$value/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_ISSUER'/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_JWKS_URL'/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_AUDIENCE' 'common-tools-mcp'/);
  assert.match(script, /Set-DefaultEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN' \$KeycloakAdmin/);
  assert.match(script, /if \(\$Mode -eq 'Apply'\) \{ \$parameters\.PromptForSecrets = \$true \}/);
  assert.match(script, /if \(\$EnableIdentityProvider\) \{ \$parameters\.EnableIdentityProvider = \$true \}/);
  assert.match(script, /\$parameters = @\{/);
  assert.doesNotMatch(script, /DiscoverLocalConfiguration = \$true/);
  assert.match(script, /DiscoverLocalPorts = \$true/);
  assert.doesNotMatch(script, /PromptForSecrets = \$true\s*\r?\n\s*Capabilities = \$Capabilities/);
  assert.match(script, /if \(\$SeparatePasswords\) \{ \$parameters\.SeparatePasswords = \$true \}/);
  assert.match(script, /& \$localDeployScript @parameters/);
  assert.match(script, /if \(\$Mode -eq 'Apply' -and -not \$SkipSmoke\)/);
  assert.match(script, /team-runtime-local-smoke\.ps1/);
  assert.match(script, /if \(\$EnableIdentityProvider\) \{\s+& \$localSmokeScript -Project \$Project -Capabilities \$Capabilities -RequireIdentityProvider\s+\} else \{\s+& \$localSmokeScript -Project \$Project -Capabilities \$Capabilities\s+\}/s);
  assert.match(script, /& \$localSmokeScript -Project \$Project -Capabilities \$Capabilities/);
  assert.doesNotMatch(script, /\$arguments = @\(/);
  assert.match(script, /team-runtime-local-deploy\.ps1/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$originalEnvironment\[\$name\], 'Process'\)/);
  assert.doesNotMatch(script, /COMMON_TOOLS_(?:POSTGRES|REDIS|MINIO|KEYCLOAK_ADMIN)_PASSWORD\s*=/);
  assert.match(packageJson, /scripts\/team-runtime-local-apply\.ps1/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-apply\.ps1/);
});

test("local migration ledger repair is narrow, local-only, and packaged", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-repair-migration-ledger.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /\[string\]\$Mode = 'Plan'/);
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /common_tools_schema_migrations/);
  assert.match(script, /010_retention_recheck\.sql/);
  assert.match(script, /011_delivery_outbox\.sql/);
  assert.match(script, /Refusing to repair another Compose project/);
  assert.match(script, /Refusing to repair a non-PostgreSQL service/);
  assert.match(script, /Local PostgreSQL container volume layout is unexpected/);
  assert.match(script, /retention_last_swept_at/);
  assert.match(script, /capability_job_deliveries/);
  assert.match(script, /maintain_capability_job_delivery/);
  assert.match(script, /capability_job_delivery_intent/);
  assert.match(script, /UPDATE common_tools_schema_migrations SET sha256/);
  assert.doesNotMatch(script, /DROP\s+DATABASE/i);
  assert.doesNotMatch(script, /docker\s+volume\s+rm/i);
  assert.match(packageJson, /scripts\/team-runtime-local-repair-migration-ledger\.ps1/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-repair-migration-ledger\.ps1/);
});

test("production deployment script requires the read-only release preflight and never builds locally", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-production-deploy.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /common-tools-docker-engine\.ps1/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /\[string\]\$ProductionEnvFile/);
  assert.match(script, /function Import-ProductionEnvironmentFile/);
  assert.match(script, /Production env file path must be absolute/);
  assert.match(script, /\^COMMON_TOOLS_\[A-Z0-9_\]\{1,120\}\$/);
  assert.match(script, /Production env file duplicates existing \$name/);
  assert.match(script, /\[Environment\]::SetEnvironmentVariable\(\$name, \$value, 'Process'\)/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds/);
  assert.match(script, /Import-ProductionEnvironmentFile \$ProductionEnvFile\s+Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds\s+\$preflight = Invoke-ProductionPreflight/s);
  assert.match(script, /team production-preflight/);
  assert.match(script, /function Resolve-PreflightComposeFiles/);
  assert.match(script, /\$composeFiles = @\(Resolve-PreflightComposeFiles -ReportedFiles @\(\$preflight\.composeFiles\) -CredentialSource \$preflight\.credentialSource\)/);
  assert.doesNotMatch(script, /\$composeFiles \+=/);
  assert.match(script, /compose\.team-siyuan-secret\.yaml/);
  assert.match(script, /Production deployment preflight returned duplicate Compose files/);
  assert.match(script, /Production deployment preflight returned an unsupported Compose file/);
  assert.match(script, /function Invoke-OidcDiscoveryPreflight/);
  assert.match(script, /common-tools-oidc-preflight\.js/);
  assert.match(script, /OIDC discovery preflight failed/);
  assert.match(script, /Invoke-OidcDiscoveryPreflight\s+\$deploymentPlan = Read-DeploymentPlan/s);
  assert.match(script, /compose\.team-production\.yaml/);
  assert.match(script, /compose\.team-production-secrets\.yaml/);
  assert.match(script, /team deployment-plan/);
  assert.match(script, /Read-DeploymentPlan/);
  assert.match(script, /'team-maintenance'/);
  assert.match(script, /function New-ProductionPreApplyChecklist/);
  assert.match(script, /preApplyChecklist = @\(New-ProductionPreApplyChecklist\)/);
  assert.match(script, /common-tools team migration-status/);
  assert.match(script, /managed PostgreSQL backup, restore target, and rollback evidence/);
  assert.match(script, /immutable release evidence revisions and image digests/);
  assert.match(script, /Keep ingress from accepting new production jobs/);
  assert.match(script, /releaseSignatureRequired = \(\$preflight\.releaseSignature\.required -eq \$true\)/);
  assert.match(script, /releaseSignatureVerified = \(\$preflight\.releaseSignature\.verified -eq \$true\)/);
  assert.match(script, /oidcDiscoveryValidated = \$true/);
  assert.match(script, /did not verify the required release signature/);
  assert.match(script, /'up', '--detach', '--no-build', '--wait'/);
  assert.doesNotMatch(script, /--build/);
  assert.doesNotMatch(script, /Invoke-Compose @\([^\r\n]*--no-deps/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("production deployment script rejects unsafe env files before Docker", () => {
  const root = path.resolve(__dirname, "..");
  const script = path.join(root, "scripts", "team-runtime-production-deploy.ps1");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-production-deploy-env-"));
  const envFile = path.join(directory, "production.env");
  const missingEnvFile = path.join(directory, "private-production-secret.env");
  const missing = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Mode", "Plan", "-ProductionEnvFile", missingEnvFile], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  const missingOutput = `${missing.stdout || ""}${missing.stderr || ""}`;
  assert.equal(missing.status, 1);
  assert.match(missingOutput, /must point to an existing file/u);
  assert.doesNotMatch(missingOutput, /private-production-secret/u);
  fs.writeFileSync(envFile, "PATH=C:\\Windows\n", "utf8");
  const result = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Mode", "Plan", "-ProductionEnvFile", envFile], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.equal(result.status, 1);
  assert.match(output, /unsupported variable name/u);
  assert.doesNotMatch(output, /Docker Compose production command failed/u);
});

test("production acceptance wrapper defaults to the protected env file and stays read-only for planning", () => {
  const root = path.resolve(__dirname, "..");
  const script = path.join(root, "scripts", "team-runtime-production-acceptance.ps1");
  const source = fs.readFileSync(script, "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(source, /ValidateSet\('Plan', 'Evidence'\)/);
  assert.match(source, /common-tools\.production\.env/);
  assert.match(source, /production-acceptance-plan/);
  assert.match(source, /production-acceptance-evidence/);
  assert.match(source, /blocked-by-missing-production-env-file/);
  assert.match(source, /mutatesProduction = \$false/);
  assert.match(source, /writesEvidence = \$false/);
  assert.doesNotMatch(source, /team-runtime-production-deploy\.ps1/);
  assert.doesNotMatch(source, /-Mode Apply/);
  assert.match(packageJson, /scripts\/team-runtime-production-acceptance\.ps1/);
  assert.match(packageJson, /common-tools:production-acceptance-preflight/);
  assert.match(packageJson, /common-tools:production-acceptance-collect/);
  assert.match(packageVerifier, /scripts\/team-runtime-production-acceptance\.ps1/);

  const missingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-production-acceptance-wrapper-"));
  const missingEnvFile = path.join(missingDirectory, "common-tools.production.env");
  const result = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Mode", "Plan", "-ProductionEnvFile", missingEnvFile], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  assert.equal(result.status, 0);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.status, "blocked-by-missing-production-env-file");
  assert.equal(canonicalPathForComparison(plan.productionEnvFile), canonicalPathForComparison(missingEnvFile));
  assert.equal(plan.mutatesProduction, false);
  assert.equal(plan.writesEvidence, false);
  assert.ok(plan.nextCommands.some((command) => command.includes("prepare-production-env.ps1")));
  assert.doesNotMatch(result.stdout + result.stderr, /password|token|secret-value|Docker Compose production command failed/iu);
});

test("production env preparation script collects secrets safely outside the repository", () => {
  const root = path.resolve(__dirname, "..");
  const script = path.join(root, "scripts", "prepare-production-env.ps1");
  const source = fs.readFileSync(script, "utf8");
  assert.match(source, /common-tools\.production\.env/);
  assert.match(source, /\[string\]\$Project = 'deploy'/);
  assert.match(source, /Output path must be outside the repository root/);
  assert.match(source, /Length -gt 0 -and -not \$Force/);
  assert.match(source, /already exists and is not empty/);
  assert.match(source, /Read-Host -Prompt \$Prompt -AsSecureString/);
  assert.match(source, /ZeroFreeBSTR\(\$pointer\)/);
  assert.match(source, /function Get-LocalDockerDefaults/);
  assert.match(source, /team local-config --project \$ComposeProject/);
  assert.match(source, /postgresql:\/\/127\.0\.0\.1:\$postgresPort\/common_tools/);
  assert.match(source, /redis:\/\/127\.0\.0\.1:\$redisPort/);
  assert.match(source, /http:\/\/127\.0\.0\.1:\$minioPort/);
  assert.match(source, /http:\/\/127\.0\.0\.1:\$remotePort/);
  assert.match(source, /COMMON_TOOLS_DATABASE_PASSWORD_FILE/);
  assert.match(source, /COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY_FILE/);
  assert.match(source, /function Test-ImageWorkerCapabilityEnabled/);
  assert.match(source, /COMMON_TOOLS_IMAGE_WORKER_IMAGE/);
  assert.match(source, /COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE/);
  assert.match(source, /\[switch\]\$ProductionRelease/);
  assert.match(source, /team-runtime-local-apply\.ps1/);
  for (const outputLine of source.split(/\r?\n/u).filter((line) => line.includes("Write-Host"))) {
    assert.doesNotMatch(outputLine, /COMMON_TOOLS_(?:DATABASE|REDIS|OBJECT_STORE).*PASSWORD/u);
  }

  const help = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Help"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /production env file/u);
  assert.match(help.stdout, /Local Docker quick path/u);
  assert.match(help.stdout, /prompts only for local deployment secrets/u);
  assert.match(help.stdout, /production-acceptance-plan/u);

  const unsafe = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Out", path.join(root, "private-production.env")], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  const unsafeOutput = `${unsafe.stdout || ""}${unsafe.stderr || ""}`;
  assert.equal(unsafe.status, 1);
  assert.match(unsafeOutput, /outside the repository root/u);
  assert.doesNotMatch(unsafeOutput, /Database password/u);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-production-env-helper-"));
  const localHint = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Out", path.join(directory, "production.env")], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  const localHintOutput = `${localHint.stdout || ""}${localHint.stderr || ""}`;
  assert.equal(localHint.status, 2);
  assert.match(localHintOutput, /team-runtime-local-apply\.ps1/u);
  assert.match(localHintOutput, /you do not need image digests or release evidence/u);
  assert.match(localHintOutput, /prompt only for local deployment passwords/u);
  assert.doesNotMatch(localHintOutput, /Remote MCP runtime image/u);
});

test("team runtime operation lock serializes deployment mutations and recovers abandoned operations", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-operation-lock.ps1"), "utf8");
  assert.match(script, /System\.Threading\.Mutex/);
  assert.match(script, /\.WaitOne\(0\)/);
  assert.match(script, /System\.Threading\.AbandonedMutexException/);
  assert.match(script, /System\.BitConverter.*ToString/);
  assert.doesNotMatch(script, /Convert\]::ToHexString/);
  assert.match(script, /Another Common Tools team runtime operation is already active/);
  assert.match(script, /\.ReleaseMutex\(\)/);
  assert.match(script, /\.Dispose\(\)/);
});

test("PostgreSQL restore drill is project-scoped, isolated, and leaves no persistent target", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-postgres-restore-drill.ps1"), "utf8");
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /\$Project-postgres-1/);
  assert.match(script, /com\.docker\.compose\.project/);
  assert.match(script, /com\.docker\.compose\.service/);
  assert.match(script, /--filter "label=com\.docker\.compose\.project=\$Project"/);
  assert.match(script, /label=com\.docker\.compose\.service=postgres/);
  assert.match(script, /'--network', 'none'/);
  assert.match(script, /'--rm'/);
  assert.match(script, /'--env-file', \$temporaryEnvironment/);
  assert.match(script, /function Test-DockerContainerExists/);
  assert.match(script, /RedirectStandardError = \$true/);
  assert.match(script, /if \(Test-DockerContainerExists \$targetContainer\)/);
  assert.match(script, /Read-PostgresRestoreSummary/);
  assert.match(script, /ToBase64String/);
  assert.match(script, /Write-PostgresDrillScripts/);
  assert.match(script, /Install-PostgresDrillScript/);
  assert.match(script, /base64 -d/);
  assert.match(script, /common-tools-restore-drill/);
  assert.match(script, /\$dumpScriptPath/);
  assert.match(script, /\$restoreScriptPath/);
  assert.match(script, /\$targetSummary -ne \$sourceSummary/);
  assert.doesNotMatch(script, /docker inspect .*Config\.Env/);
});

test("object-store restore drill uses a running project API without inspecting configuration", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-object-store-restore-drill.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Apply requires -Confirm/);
  assert.match(script, /common-tools-docker-engine\.ps1/);
  assert.match(script, /label=com\.docker\.compose\.project=\$Project/);
  assert.match(script, /label=com\.docker\.compose\.service=remote-mcp/);
  assert.match(script, /common-tools-team-object-store-restore-drill\.js/);
  assert.doesNotMatch(script, /docker inspect .*Config\.Env/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("isolated Compose smoke script uses a unique project, temporary credentials, and exact cleanup", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-compose-smoke.ps1"), "utf8");
  const engineProbe = fs.readFileSync(path.join(root, "scripts", "common-tools-docker-engine.ps1"), "utf8");
  assert.match(script, /common-tools-docker-engine\.ps1/);
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds/);
  assert.match(engineProbe, /Get-Command -Name 'docker\.exe' -CommandType Application/);
  assert.match(engineProbe, /ProcessStartInfo/);
  assert.match(engineProbe, /CreateNoWindow = \$true/);
  assert.match(engineProbe, /RedirectStandardOutput = \$true/);
  assert.match(engineProbe, /Arguments = 'version --format/);
  assert.doesNotMatch(engineProbe, /ArgumentList\.Add/);
  assert.match(engineProbe, /function Test-DockerEngineProbe/);
  assert.match(engineProbe, /function Test-DockerVolumeExists/);
  assert.match(engineProbe, /Arguments = "volume inspect \$Name"/);
  assert.match(engineProbe, /WaitForExit\(5000\)/);
  assert.match(engineProbe, /WaitForExit\(\$TimeoutMilliseconds\)/);
  assert.match(engineProbe, /\$deadline = \[DateTime\]::UtcNow\.AddSeconds\(\$TimeoutSeconds\)/);
  assert.match(engineProbe, /\$remainingMilliseconds -lt 1000/);
  assert.match(engineProbe, /Test-DockerEngineProbe -TimeoutMilliseconds \$attemptMilliseconds/);
  assert.match(engineProbe, /Start-Sleep -Milliseconds/);
  assert.match(engineProbe, /\$process\.Kill\(\$true\)/);
  assert.match(script, /ctsmoke-\$\(\[Guid\]::NewGuid\(\)/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /Assert-LoopbackPortAvailable/);
  assert.match(script, /Find-LoopbackPortRange/);
  assert.match(script, /Get-Random -Minimum 20000 -Maximum 60000/);
  assert.match(script, /\$null -eq \$BasePort/);
  assert.match(script, /team-worker-ppt-quality/);
  assert.match(script, /team-worker-ppt-improve/);
  assert.match(script, /team-worker-ppt-create/);
  assert.match(script, /team-maintenance/);
  assert.match(script, /COMMON_TOOLS_TEAM_CAPABILITIES = 'image-to-editable,project-audit,ppt-create,ppt-improve,ppt-quality'/);
  assert.match(script, /'up', '--detach', '--build', '--wait'/);
  assert.match(script, /'down', '--volumes', '--remove-orphans'/);
  assert.match(script, /foreach \(\$name in \$temporaryVariables\) \{ \[Environment\]::SetEnvironmentVariable/);
  assert.match(script, /\/readyz/);
  assert.doesNotMatch(script, /FLUSHDB|rm -rf|Remove-Item.*repositoryRoot/i);
});

test("local runtime smoke script verifies gateway metadata without secrets or jobs", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-smoke.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /team', 'local-config', '--project', \$Project/);
  assert.match(script, /team', 'runtime', '--project', \$Project/);
  assert.match(script, /--require-gateway/);
  assert.match(script, /\/readyz/);
  assert.match(script, /\/.well-known\/oauth-protected-resource\/mcp/);
  assert.match(script, /\[switch\]\$RequireIdentityProvider/);
  assert.match(script, /function Resolve-LocalOidcIssuer/);
  assert.match(script, /Local team identity provider is unavailable/);
  assert.match(script, /\/.well-known\/openid-configuration/);
  assert.match(script, /identityProviderVerified/);
  assert.match(script, /common-tools:capability:\$capability/);
  assert.match(script, /unauthorizedChallengeVerified/);
  assert.match(script, /Local team gateway URL must be a loopback HTTP origin/);
  assert.match(script, /Remote response is too large/);
  assert.doesNotMatch(script, /Read-Host|COMMON_TOOLS_.*PASSWORD|create_team_job|upload/i);
  assert.match(packageJson, /common-tools:team-local-smoke/);
  assert.match(packageJson, /scripts\/team-runtime-local-smoke\.ps1/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-smoke\.ps1/);
});

test("local authenticated job smoke wrapper prepares input and supports local direct login plus browser PKCE login", () => {
  const root = path.resolve(__dirname, "..");
  const scriptPath = path.join(root, "scripts", "team-runtime-local-job-smoke.ps1");
  const script = fs.readFileSync(scriptPath, "utf8");
  const inputHelper = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-job-smoke-input.js"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /\[string\]\$Capability = 'image-to-editable'/);
  assert.match(script, /\[string\]\$TokenEnv = 'COMMON_TOOLS_JOB_SMOKE_TOKEN'/);
  assert.match(script, /\[switch\]\$Login/);
  assert.match(script, /\[switch\]\$DirectLogin/);
  assert.match(script, /\[string\]\$Username = 'local-tester'/);
  assert.match(script, /\[string\]\$OidcIssuer = ''/);
  assert.match(script, /function Request-LocalDirectAccessToken/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD/);
  assert.match(script, /directAccessGrantsEnabled = \$Enabled/);
  assert.match(script, /Local Keycloak MCP client direct grant restore failed/);
  assert.match(script, /function New-PkceChallenge/);
  assert.match(script, /code_challenge_method = 'S256'/);
  assert.match(script, /client_id = 'common-tools-mcp'/);
  assert.match(script, /redirect_uri = \$loopbackRedirectUri/);
  assert.match(script, /common-tools:capability:\$CapabilityName/);
  assert.match(script, /Start-Process "\$authorizationEndpoint`\?\$encoded"/);
  assert.match(script, /SetEnvironmentVariable\(\$TokenEnv, \$token, 'Process'\)/);
  assert.match(script, /SetEnvironmentVariable\(\$TokenEnv, \$null, 'Process'\)/);
  assert.match(script, /team-runtime-authenticated-job-smoke\.js/);
  assert.match(script, /team-runtime-local-job-smoke-input\.js/);
  assert.match(script, /--content-type', \$contentType/);
  assert.match(script, /--artifact-name', \$defaultArtifactName/);
  assert.match(inputHelper, /deck\.json/);
  assert.match(inputHelper, /tarEntry\("deck\.json"/);
  assert.match(inputHelper, /createPptCreateArchive/);
  assert.match(inputHelper, /ppt-create/);
  assert.doesNotMatch(script, /team' 'raw-image-archive'/);
  assert.doesNotMatch(script, /iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB/);
  assert.match(script, /Set \$TokenEnv to a bearer token/u);
  assert.match(script, /rerun with -DirectLogin/u);
  assert.match(script, /rerun with -Login/u);
  assert.match(script, /does not print OAuth tokens/u);
  assert.match(script, /Remove-Item -LiteralPath \$temporaryRoot -Recurse -Force/);
  assert.match(packageJson, /scripts\/team-runtime-local-job-smoke\.ps1/);
  assert.match(packageJson, /scripts\/team-runtime-local-job-smoke-input\.js/);
  assert.match(packageJson, /common-tools:team-local-job-smoke/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-job-smoke\.ps1/);

  const result = spawnSync("pwsh", ["-NoProfile", "-File", scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.equal(result.status, 2);
  assert.match(output, /COMMON_TOOLS_JOB_SMOKE_TOKEN/u);
  assert.match(output, /-DirectLogin/u);
  assert.match(output, /-Login/u);
  assert.doesNotMatch(output, /create_team_job|uploadUrl|Authorization/u);
});

test("local Keycloak test user helper is packaged and keeps passwords interactive", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-keycloak-local-test-user.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  const cli = fs.readFileSync(path.join(root, "packages", "cli", "bin", "common-tools.js"), "utf8");
  assert.match(script, /\[string\]\$Username = 'local-tester'/);
  assert.match(script, /\[string\]\$ProjectId = 'deploy'/);
  assert.match(script, /Read-Host -Prompt \$Prompt -AsSecureString/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD/);
  assert.match(script, /team', 'keycloak-local-test-user', '--apply'/);
  assert.doesNotMatch(script, /--password|--admin-password/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$originalEnvironment\[\$name\], 'Process'\)/);
  assert.match(cli, /team keycloak-local-test-user --apply/);
  assert.match(packageJson, /scripts\/team-keycloak-local-test-user\.ps1/);
  assert.match(packageJson, /common-tools:keycloak-local-test-user/);
  assert.match(packageVerifier, /scripts\/team-keycloak-local-test-user\.ps1/);
});

test("local acceptance wrapper chains deployment, user setup and authenticated smoke", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-acceptance.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /\[string\]\$Project = 'deploy'/);
  assert.match(script, /\[string\]\$Username = 'local-tester'/);
  assert.match(script, /\[string\]\$EvidenceFile = ''/);
  assert.match(script, /team-runtime-local-apply\.ps1/);
  assert.match(script, /team-runtime-local-smoke\.ps1/);
  assert.match(script, /team-keycloak-local-test-user\.ps1/);
  assert.match(script, /team-runtime-local-job-smoke\.ps1/);
  assert.match(script, /verify-local-acceptance-evidence\.js/);
  assert.match(script, /function Resolve-EvidenceFile/);
  assert.match(script, /artifacts\/local-acceptance/);
  assert.match(script, /Local acceptance evidence file must stay inside the repository/);
  assert.match(script, /function Read-JsonOutput/);
  assert.match(script, /-RequireIdentityProvider/);
  assert.match(script, /Local acceptance authenticated job smoke evidence is incomplete/);
  assert.match(script, /jobId = \$jobId/);
  assert.match(script, /status = \$jobStatus/);
  assert.match(script, /authenticatedJobSmoke = \$jobSmokeEvidence/);
  assert.match(script, /Set-Content -LiteralPath \$evidenceTarget -Encoding UTF8 -NoNewline/);
  assert.match(script, /& node \$verifyEvidenceScript '--evidence-file' \$evidenceTarget '--capabilities' \$Capabilities/);
  assert.match(script, /Local acceptance evidence written to \$evidenceTarget/);
  assert.match(packageJson, /scripts\/verify-local-acceptance-evidence\.js/);
  assert.match(packageJson, /common-tools:verify-local-acceptance/);
  assert.match(packageVerifier, /scripts\/verify-local-acceptance-evidence\.js/);
  assert.match(script, /COMMON_TOOLS_DATABASE_PASSWORD/);
  assert.match(script, /Shared local acceptance password/);
  assert.match(script, /Shared local acceptance password must contain at least 8 characters/);
  assert.match(script, /Local Keycloak test user password must contain at least 8 characters/);
  assert.match(script, /\[switch\]\$SeparateTestUserPassword/);
  assert.match(script, /\[switch\]\$PreflightOnly/);
  assert.match(script, /\[switch\]\$SkipDeploy/);
  assert.match(script, /\[switch\]\$BrowserLogin/);
  assert.match(script, /function Get-MissingManagedSecrets/);
  assert.match(script, /missingSecretVariables = \$missingManagedSecrets/);
  assert.match(script, /willUseDirectLocalLogin = \(-not \$BrowserLogin\)/);
  assert.match(script, /willOpenBrowserLogin = \[bool\]\$BrowserLogin/);
  assert.match(script, /writesEvidence = \$false/);
  assert.match(script, /if \(\$PreflightOnly\)/);
  assert.match(script, /reusing existing local Common Tools runtime with Keycloak enabled/);
  assert.match(script, /COMMON_TOOLS_POSTGRES_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$sharedPassword, 'Process'\)/);
  assert.match(script, /\$testUserPassword = if \(\$SeparateTestUserPassword\)/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$originalEnvironment\[\$name\], 'Process'\)/);
  assert.match(script, /-EnableIdentityProvider/);
  assert.match(script, /\$jobArguments = @\{/);
  assert.match(script, /Username = \$Username/);
  assert.match(script, /if \(\$BrowserLogin\) \{ \$jobArguments\.Login = \$true \} else \{ \$jobArguments\.DirectLogin = \$true \}/);
  assert.match(script, /if \(-not \$SkipJobWait\) \{ \$jobArguments\.Wait = \$true \}/);
  assert.doesNotMatch(script, /--password|--admin-password/);
  assert.match(packageJson, /scripts\/team-runtime-local-acceptance\.ps1/);
  assert.match(packageJson, /common-tools:team-local-acceptance-preflight/);
  assert.match(packageJson, /team-runtime-local-acceptance\.ps1 -PreflightOnly/);
  assert.match(packageJson, /common-tools:team-local-acceptance/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-acceptance\.ps1/);
});

test("local closeout wrapper runs reset, authenticated acceptance, and architecture closeout with one password", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-local-closeout.ps1"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  const packageVerifier = fs.readFileSync(path.join(root, "scripts", "verify-runtime-package.js"), "utf8");
  assert.match(script, /Shared local closeout password/);
  assert.match(script, /\[switch\]\$PreflightOnly/);
  assert.match(script, /\[switch\]\$SkipFreshReset/);
  assert.match(script, /\[switch\]\$BrowserLogin/);
  assert.match(script, /willFreshResetLocalState = \(-not \$SkipFreshReset\)/);
  assert.match(script, /willDeploy = \(-not \$SkipFreshReset\)/);
  assert.match(script, /willUseDirectLocalLogin = \(-not \$BrowserLogin\)/);
  assert.match(script, /willOpenBrowserLogin = \[bool\]\$BrowserLogin/);
  assert.match(script, /writesEvidence = \$false/);
  assert.match(script, /Shared local closeout password must contain at least 8 characters/);
  assert.match(script, /COMMON_TOOLS_DATABASE_PASSWORD/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD/);
  assert.match(script, /team-runtime-local-fresh-reset\.ps1/);
  assert.match(script, /team-runtime-local-acceptance\.ps1/);
  assert.match(script, /verify-architecture-closeout\.js/);
  assert.match(script, /team-runtime-doctor\.js/);
  assert.match(script, /function Invoke-LocalCloseoutDoctor/);
  assert.match(script, /function Set-MissingLocalGatewayPortFromCompose/);
  assert.match(script, /function Assert-ExistingLocalRuntimeReady/);
  assert.match(script, /checking existing local Common Tools runtime before prompting for secrets/);
  assert.match(script, /Existing local Common Tools runtime is not ready for authenticated closeout/);
  assert.match(script, /remote-mcp-gateway/);
  assert.match(script, /COMMON_TOOLS_REMOTE_PORT/);
  assert.match(script, /willDiscoverGatewayPort = \$true/);
  assert.match(script, /Local closeout failed during \$Phase; collecting sanitized runtime diagnostics/);
  assert.match(script, /'--expected-capabilities' \$Capabilities/);
  assert.match(script, /if \(\$SkipFreshReset\)/);
  assert.match(script, /reusing existing local Common Tools runtime/);
  assert.match(script, /& \$freshResetScript -Mode Apply -Project \$Project -WaitTimeoutSeconds \$WaitTimeoutSeconds -Confirm/);
  assert.match(script, /\$acceptanceArguments = @\{/);
  assert.match(script, /Project = \$Project/);
  assert.match(script, /SkipDeploy = \$true/);
  assert.match(script, /\$acceptanceArguments\.EvidenceFile = \$EvidenceFile/);
  assert.match(script, /\$acceptanceArguments\.BrowserLogin = \$true/);
  assert.match(script, /& node \$closeoutScript '--require-complete'/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$originalEnvironment\[\$name\], 'Process'\)/);
  assert.doesNotMatch(script, /--password|--admin-password/);
  assert.match(packageJson, /scripts\/team-runtime-local-closeout\.ps1/);
  assert.match(packageJson, /common-tools:team-local-closeout-preflight/);
  assert.match(packageJson, /common-tools:team-local-closeout-existing-preflight/);
  assert.match(packageJson, /common-tools:team-local-closeout/);
  assert.match(packageJson, /common-tools:team-local-closeout-existing/);
  assert.match(packageVerifier, /scripts\/team-runtime-local-closeout\.ps1/);
});

test("image Worker Docker context excludes local .NET outputs while retaining builder sources", () => {
  const root = path.resolve(__dirname, "..");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable.dockerignore"), "utf8");
  assert.match(ignore, /!packages\/slideclone-native-engine\/\*\*/);
  assert.match(ignore, /OpenXmlDeckBuilder\/bin\/\*\*/);
  assert.match(ignore, /OpenXmlDeckBuilder\/obj\/\*\*/);
  assert.match(ignore, /package-lock\.json/);
});

test("optional Prometheus profile scrapes only the internal API with a mounted metrics credential", () => {
  const root = path.resolve(__dirname, "..");
  const observability = fs.readFileSync(path.join(root, "deploy", "compose.team-observability.yaml"), "utf8");
  const prometheus = fs.readFileSync(path.join(root, "deploy", "prometheus", "prometheus.yaml"), "utf8");
  const service = serviceBlock(observability, "prometheus");
  const initializer = serviceBlock(observability, "prometheus-volume-init");
  assert.match(observability, /COMMON_TOOLS_METRICS_TOKEN_FILE:\?set metrics token secret file/);
  assert.match(initializer, /image: busybox:1\.37/);
  assert.match(initializer, /profiles: \["team-observability"\]/);
  assert.match(initializer, /network_mode: "none"/);
  assert.match(initializer, /user: "0:0"/);
  assert.match(initializer, /restart: "no"/);
  assert.match(initializer, /read_only: true/);
  assert.match(initializer, /cap_drop: \["ALL"\]/);
  assert.match(initializer, /cap_add: \["CHOWN", "FOWNER"\]/);
  assert.match(initializer, /common-tools-prometheus-data/);
  assert.match(service, /profiles: \["team-observability"\]/);
  assert.match(service, /remote-mcp: \{ condition: service_healthy \}/);
  assert.match(service, /prometheus-volume-init: \{ condition: service_completed_successfully \}/);
  assert.match(service, /127\.0\.0\.1:\$\{COMMON_TOOLS_PROMETHEUS_PORT:-59090\}:9090/);
  assert.match(service, /read_only: true/);
  assert.match(service, /cap_drop: \["ALL"\]/);
  assert.match(prometheus, /job_name: common-tools-api/);
  assert.match(prometheus, /credentials_file: \/run\/secrets\/common_tools_metrics_token/);
  assert.match(prometheus, /- \/etc\/prometheus\/common-tools-alerts\.yaml/);
  assert.doesNotMatch(prometheus, /\/etc\/prometheus\/rules\//);
  assert.match(prometheus, /remote-mcp:3000/);
});
