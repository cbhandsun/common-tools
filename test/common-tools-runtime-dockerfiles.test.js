"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
test("runtime Dockerfiles load slideclone-core without skill-layer initialization helpers", () => {
  for (const name of ["Dockerfile.remote-mcp", "Dockerfile.image-to-editable"]) {
    const dockerfile = fs.readFileSync(path.join(ROOT, "deploy", "docker", name), "utf8");
    assert.match(dockerfile, /COPY packages \.\/packages/);
    assert.doesNotMatch(dockerfile, /skills\/pd-hifi-slideclone\/scripts\/lib\/(?:config-validation|image-size)\.js/);
  }
});

test("single-ingress gateway replaces rather than resets its nginx config mount", () => {
  const overlay = fs.readFileSync(path.join(ROOT, "deploy", "compose.team-single-ingress.yaml"), "utf8");
  assert.match(overlay, /remote-mcp-gateway:[\s\S]*?\r?\n    volumes:\r?\n[\s\S]*?team-mcp-single-ingress\.conf/);
  assert.doesNotMatch(overlay, /remote-mcp-gateway:[\s\S]*?volumes:\s*!reset/);
});
