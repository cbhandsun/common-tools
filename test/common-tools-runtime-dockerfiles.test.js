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

test("team image worker forwards the same connector strategy with and without an OCR overlay", () => {
  const key = "COMMON_TOOLS_IMAGE_CONNECTOR_CORNER_MODE";
  for (const name of ["compose.team-api.yaml", "compose.team-image-ocr.yaml", "compose.team-image-paddleocr.yaml"]) {
    const source = fs.readFileSync(path.join(ROOT, "deploy", name), "utf8");
    const service = source.match(/^  image-to-editable-worker:\r?\n(?:(?!^  [a-zA-Z0-9_-]+:).|\r?\n)*/mu)?.[0];
    assert.ok(service, `${name}: image worker service is required`);
    const mappings = service.split(/\r?\n/u).filter(line => line.trimStart().startsWith(key + ":"));
    assert.deepEqual(mappings.map(line => line.trim()), [key + ": ${" + key + "-reroutable-elbow}"], name);
  }
});

test("team image worker forwards output selection with and without an OCR overlay", () => {
  const key = "COMMON_TOOLS_IMAGE_OUTPUT_POLICY";
  for (const name of ["compose.team-api.yaml", "compose.team-image-ocr.yaml", "compose.team-image-paddleocr.yaml"]) {
    const source = fs.readFileSync(path.join(ROOT, "deploy", name), "utf8");
    const service = source.match(/^  image-to-editable-worker:\r?\n(?:(?!^  [a-zA-Z0-9_-]+:).|\r?\n)*/mu)?.[0];
    assert.ok(service, `${name}: image worker service is required`);
    const mappings = service.split(/\r?\n/u).filter(line => line.trimStart().startsWith(key + ":"));
    assert.deepEqual(mappings.map(line => line.trim()), [key + ": ${" + key + "-source-fidelity}"], name);
  }
});

test("offline PaddleOCR refresh publishes its writer from locked source instead of host build artifacts", () => {
  const file = path.join(ROOT, "deploy/docker/Dockerfile.image-to-editable-paddleocr-offline");
  const dockerfile = fs.readFileSync(file, "utf8");
  assert.match(dockerfile, /FROM mcr\.microsoft\.com\/dotnet\/sdk:8\.0-bookworm-slim AS openxml-builder/u);
  assert.match(dockerfile, /dotnet restore .* --locked-mode/u);
  assert.match(dockerfile, /dotnet publish .* --configuration Release --no-restore --output \/opt\/openxml/u);
  assert.match(dockerfile, /COPY --from=openxml-builder --chown=worker:worker \/opt\/openxml \/opt\/openxml/u);
  assert.equal((dockerfile.match(/--mount=type=cache,id=common-tools-openxml-nuget,target=\/root\/\.nuget\/packages/gu) || []).length, 2);
  for (const part of ["dotnet", "host", "shared"]) {
    assert.ok(dockerfile.includes(`COPY --from=openxml-builder /usr/share/dotnet/${part} /usr/share/dotnet/${part}`));
  }
  assert.doesNotMatch(dockerfile, /OpenXmlDeckBuilder\/(?:bin|obj)\//u);
  assert.match(dockerfile, /FROM \$\{BASE_IMAGE\}[\s\S]*RUN \/usr\/bin\/python3 -I -c 'import uno'/u);
  assert.match(dockerfile, /ENV LIBREOFFICE_PYTHON_BIN=\/usr\/bin\/python3/u);
  const ignore = fs.readFileSync(file + ".dockerignore", "utf8");
  assert.match(ignore, /^\*\*$/mu);
  assert.match(ignore, /^!packages\/\*\*$/mu);
  for (const part of ["bin", "obj"]) {
    assert.ok(ignore.includes(`\npackages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/${part}/**`));
  }
  assert.doesNotMatch(ignore, /^!(?:\.codex-temp|output-latest|skills)\//mu);
});
