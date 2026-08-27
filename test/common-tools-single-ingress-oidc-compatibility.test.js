"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("single ingress advertises the Codex issuer-callback compatibility view only for OIDC discovery", () => {
  const configuration = fs.readFileSync(path.join(__dirname, "..", "deploy", "nginx", "team-mcp-single-ingress.conf"), "utf8");
  const compatibilityLocation = "location = /id/realms/common-tools/.well-known/openid-configuration";
  assert.ok(configuration.includes(compatibilityLocation));
  assert.ok(configuration.includes("proxy_set_header Accept-Encoding \"\";"));
  assert.ok(configuration.includes("proxy_hide_header Content-Length;"));
  assert.ok(configuration.includes("sub_filter '\"authorization_response_iss_parameter_supported\":true' '\"authorization_response_iss_parameter_supported\":false';"));
  assert.ok(configuration.indexOf(compatibilityLocation) < configuration.indexOf("location ^~ /id/"));
});
