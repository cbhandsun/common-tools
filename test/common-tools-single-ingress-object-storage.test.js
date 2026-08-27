"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("single ingress preserves the forwarded public host for SigV4 object URLs", () => {
  const configuration = fs.readFileSync(path.join(__dirname, "..", "deploy", "nginx", "team-mcp-single-ingress.conf"), "utf8");
  const storageRoute = configuration.match(/location \^~ \/common-tools-artifacts\/ \{([\s\S]*?)\n  \}/);
  assert.ok(storageRoute, "the signed object-store route must exist");
  assert.match(storageRoute[1], /proxy_set_header Host \$COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST;/);
  assert.match(storageRoute[1], /proxy_request_buffering off;/);
  const baseGateway = fs.readFileSync(path.join(__dirname, "..", "deploy", "compose.team-gateway.yaml"), "utf8");
  const ingressOverlay = fs.readFileSync(path.join(__dirname, "..", "deploy", "compose.team-single-ingress.yaml"), "utf8");
  const deployScript = fs.readFileSync(path.join(__dirname, "..", "scripts", "team-runtime-local-deploy.ps1"), "utf8");
  assert.match(baseGateway, /target: \/etc\/nginx\/templates\/default\.conf\.template/);
  assert.match(baseGateway, /\/etc\/nginx\/conf\.d:rw,noexec,nosuid/);
  assert.match(ingressOverlay, /COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST:/);
  assert.match(deployScript, /SetEnvironmentVariable\('COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST', \$uri\.Authority, 'Process'\)/);
});
