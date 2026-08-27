"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const realmFile = path.join(path.resolve(__dirname, ".."), "deploy", "keycloak", "realm-common-tools.json");

function mapper(client, name) {
  const found = client.protocolMappers.find((entry) => entry && entry.name === name);
  if (!found) throw new Error(`missing protocol mapper: ${name}`);
  return found;
}

test("local Keycloak realm mints the restricted project-membership claim without users or credentials", () => {
  const realm = JSON.parse(fs.readFileSync(realmFile, "utf8"));
  assert.equal(realm.realm, "common-tools");
  assert.equal(Object.prototype.hasOwnProperty.call(realm, "users"), false);
  const client = realm.clients.find((entry) => entry.clientId === "common-tools-mcp");
  assert.ok(client);
  assert.equal(client.publicClient, true);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
  assert.equal(Object.prototype.hasOwnProperty.call(client, "defaultClientScopes"), false);
  assert.equal(client.redirectUris.some((uri) => uri === "*"), false);
  // Native OAuth clients use an ephemeral loopback port. Restrict the wildcard
  // to the numeric loopback host instead of allowing a broad host wildcard.
  assert.deepEqual(client.redirectUris, ["http://127.0.0.1", "http://127.0.0.1:*"]);
  assert.equal(client.webOrigins.some((origin) => origin === "*"), false);
  assert.deepEqual(client.webOrigins, ["http://127.0.0.1:54000"]);
  const projects = mapper(client, "common-tools-project-membership");
  assert.equal(projects.protocolMapper, "oidc-usermodel-attribute-mapper");
  assert.deepEqual(projects.config, {
    "user.attribute": "common_tools_projects",
    "claim.name": "common_tools_projects",
    "jsonType.label": "JSON",
    multivalued: "false",
    "access.token.claim": "true",
    "id.token.claim": "false",
    "userinfo.token.claim": "false",
    "introspection.token.claim": "true"
  });
  const serialized = JSON.stringify(realm);
  assert.doesNotMatch(serialized, /"users"\s*:/);
  assert.doesNotMatch(serialized, /"credentials"\s*:/);
  assert.doesNotMatch(serialized, /"secret"\s*:/i);
});
