"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

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
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /Fresh local reset requires one shared local password/);
  assert.match(script, /Fresh local reset password must contain at least 8 characters/);
  assert.match(script, /Invoke-FreshCompose @\('down', '--volumes'\)/);
  assert.doesNotMatch(script, /Invoke-FreshCompose @\('down', '--volumes', '--remove-orphans'\)/);
  assert.match(script, /team-runtime-local-deploy\.ps1/);
  assert.match(script, /-DiscoverLocalPorts/);
  assert.match(script, /function Set-MissingLocalMinioPorts/);
  assert.match(script, /Test-LoopbackPortAvailable 59000/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
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
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds/);
  assert.match(script, /Invoke-Compose @\('config', '--quiet'\)/);
  assert.match(script, /Invoke-Compose @\('up', '--detach', '--build', '--wait'/);
  assert.match(script, /Invoke-Compose @\('up', '--detach', '--wait', '--wait-timeout', \$WaitTimeoutSeconds, 'minio'\)/);
  assert.match(script, /A root-password mismatch must not trigger a costly partial rollout/);
  assert.match(script, /'deployment-plan'/);
  assert.match(script, /team local-config --project \$Project/);
  assert.match(script, /\[Environment\]::SetEnvironmentVariable\(\$name, \$value\.Trim\(\), 'Process'\)/);
  assert.match(script, /if \(\$DiscoverLocalConfiguration\) \{\s+Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds\s+\$dockerEngineChecked = \$true\s+Set-MissingLocalConfiguration/s);
  assert.match(script, /if \(-not \$dockerEngineChecked\) \{ Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds \}/);
  assert.match(script, /function Set-MissingLocalMinioPorts/);
  assert.match(script, /Test-LoopbackPortAvailable 59000/);
  assert.match(script, /Get-Random -Minimum 20000 -Maximum 65535/);
  assert.match(script, /COMMON_TOOLS_MINIO_CONSOLE_PORT/);
  assert.match(script, /Read-DeploymentPlan/);
  assert.match(script, /function Assert-LocalRuntime/);
  assert.match(script, /team runtime --project \$Project --capabilities \(\$Capabilities -join ','\) --require-gateway/);
  assert.match(script, /Assert-LocalRuntime @\(\$deploymentPlan\.capabilities\)/);
  assert.match(script, /function Assert-SingleIngressRuntime/);
  assert.match(script, /team-runtime-doctor\.js/);
  assert.match(script, /--allow-remote/);
  assert.match(script, /--expected-capabilities/);
  assert.match(script, /Synchronize-SingleIngressMcpOAuthClient\s+Assert-SingleIngressRuntime @\(\$deploymentPlan\.capabilities\)/s);
  assert.match(script, /'team-maintenance'/);
  assert.match(script, /enabledCapabilities = @\(\$deploymentPlan\.capabilities\)/);
  assert.match(script, /workerProfiles = @\(\$deploymentPlan\.workerProfiles\)/);
  assert.doesNotMatch(script, /\$workerProfiles = @\{/);
  assert.match(script, /\$missingEnvironment = @\(\)/);
  assert.match(script, /\$missingEnvironment -join ', '/);
  assert.match(script, /COMMON_TOOLS_MINIO_PASSWORD must contain at least 8 characters/);
  assert.doesNotMatch(script, /Invoke-Compose @\([^\r\n]*--no-deps/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
});

test("production deployment script requires the read-only release preflight and never builds locally", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "scripts", "team-runtime-production-deploy.ps1"), "utf8");
  assert.match(script, /ValidateSet\('Plan', 'Apply'\)/);
  assert.match(script, /common-tools-docker-engine\.ps1/);
  assert.match(script, /team-runtime-operation-lock\.ps1/);
  assert.match(script, /Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project/);
  assert.match(script, /\$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project \$Project\s+try \{/s);
  assert.match(script, /\} finally \{\s+Exit-CommonToolsTeamRuntimeOperationLock -Lock \$operationLock/s);
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds/);
  assert.match(script, /Assert-DockerEngineAvailable -TimeoutSeconds \$DockerEngineTimeoutSeconds\s+\$preflight = Invoke-ProductionPreflight/s);
  assert.match(script, /team production-preflight/);
  assert.match(script, /function Resolve-PreflightComposeFiles/);
  assert.match(script, /\$composeFiles = @\(Resolve-PreflightComposeFiles @\(\$preflight\.composeFiles\)\)/);
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
  assert.match(script, /releaseSignatureRequired = \(\$preflight\.releaseSignature\.required -eq \$true\)/);
  assert.match(script, /releaseSignatureVerified = \(\$preflight\.releaseSignature\.verified -eq \$true\)/);
  assert.match(script, /oidcDiscoveryValidated = \$true/);
  assert.match(script, /did not verify the required release signature/);
  assert.match(script, /'up', '--detach', '--no-build', '--wait'/);
  assert.doesNotMatch(script, /--build/);
  assert.doesNotMatch(script, /Invoke-Compose @\([^\r\n]*--no-deps/);
  assert.doesNotMatch(script, /Get-ChildItem.*Env/);
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

test("image Worker Docker context excludes local .NET outputs while retaining builder sources", () => {
  const root = path.resolve(__dirname, "..");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable.dockerignore"), "utf8");
  assert.match(ignore, /!skills\/pd-hifi-slideclone\/dotnet\/OpenXmlDeckBuilder\/\*\*/);
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
