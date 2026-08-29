"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("immutable release workflow binds Marketplace source and both deployable images to one signed tag", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "release.yml"), "utf8").replaceAll("\r\n", "\n");
  for (const marker of [
    'tags:\n      - "v*.*.*"',
    'test "${GITHUB_REF_NAME}" = "v${version}"',
    'test "$(git rev-list -n 1 "${GITHUB_REF_NAME}")" = "${GITHUB_SHA}"',
    "Dockerfile.remote-mcp",
    "Dockerfile.image-to-editable",
    "steps.remote.outputs.digest",
    "steps.image_worker.outputs.digest",
    "cosign sign --yes",
    "cosign verify --certificate-identity",
    "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6",
    "common-tools:verify-release-evidence",
    "cosign sign-blob --yes --bundle",
    "release already exists; refusing to overwrite immutable release",
    "gh release create"
  ]) assert.equal(workflow.includes(marker), true, `missing release protection: ${marker}`);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@(main|master|v\d+)\s*$/mu);
  assert.match(workflow, /permissions:[\s\S]*id-token: write[\s\S]*attestations: write/);
});
