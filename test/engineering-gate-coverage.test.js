"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { ESLint } = require("eslint");
const { discoverTestFiles } = require("../scripts/test-sharded");

const root = path.resolve(__dirname, "..");

test("production entries and the extracted crop stage receive executable lint rules", async () => {
  const lint = new ESLint({ cwd: root });
  for (const filePath of [
    "packages/cli/bin/common-tools.js",
    "packages/remote-mcp-server/bin/common-tools-team-image-worker.js",
    "packages/mcp-server/bin/common-tools-mcp.js",
    "skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer.js",
    "skills/pd-hifi-slideclone/scripts/lib/final-page-cache.js",
    "skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice.js",
    "packages/slideclone-core/render-libreoffice.js",
    "packages/slideclone-core/pptx-openxml-dotnet.js",
    "packages/slideclone-core/openxml-build-jobs.js",
    "packages/slideclone-core/page-semantic-claims.js",
    "packages/slideclone-core/native-rebuilder-policy.js",
    "packages/slideclone-core/native-object-conflict-arbitrator.js",
    "packages/slideclone-core/skills-capability-matrix.js",
    "packages/slideclone-core/demand-intake-funnel.js",
    "packages/slideclone-core/smart-review-branch-gate.js",
    "packages/slideclone-core/skill-chain-orchestration.js",
    "packages/slideclone-core/asset-landing-triad.js",
    "packages/slideclone-core/chart-native-payload.js",
    "packages/slideclone-core/restricted-svg.js",
    "packages/slideclone-core/openxml-build-cache.js",
    "packages/slideclone-core/pptx-zip.js",
    "packages/slideclone-core/cache-budget.js",
    "skills/pd-hifi-slideclone/scripts/lib/render-cache-metadata.js"
  ]) {
    assert.equal(await lint.isPathIgnored(path.join(root, filePath)), false, filePath);
    const [result] = await lint.lintText('"use strict";\nmissingVariable();\n', { filePath });
    assert.ok(result.messages.some((message) => message.ruleId === "no-undef"), filePath);
  }
});

test("MCP and Worker production entries reject console logging while build outputs stay ignored", async () => {
  const lint = new ESLint({ cwd: root });
  for (const filePath of [
    "packages/remote-mcp-server/bin/common-tools-team-image-worker.js",
    "packages/mcp-server/bin/common-tools-mcp.js"
  ]) {
    const [result] = await lint.lintText('console.log("fixture");', { filePath });
    assert.ok(result.messages.some((message) => message.ruleId === "no-console"), filePath);
  }
  assert.equal(await lint.isPathIgnored(path.join(root, "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/bin/generated.js")), true);
});

test("new crop and gate regressions are discovered by the unified CI suite", () => {
  const names = discoverTestFiles(root, "unit").map(({ file }) => file.replaceAll("\\", "/"));
  assert.ok(names.includes("test/graphic-crop-materializer.test.js"));
  assert.ok(names.includes("test/final-page-cache.test.js"));
  assert.ok(names.includes("test/slideclone-config-security.test.js"));
  assert.ok(names.includes("test/common-tools-team-ocr-profile.test.js"));
  assert.ok(names.includes("test/common-tools-worker-settings.test.js"));
  assert.ok(names.includes("test/common-tools-release-evidence.test.js"));
  const integration = discoverTestFiles(root, "integration").map(({ file }) => file.replaceAll("\\", "/"));
  assert.ok(integration.includes("test/render-libreoffice.test.js"));
  assert.ok(names.includes("test/page-image-finalizer.test.js"));
  assert.ok(names.includes("test/page-graphics-stage.test.js"));
  assert.ok(names.includes("test/slide-size.test.js"));
  assert.ok(names.includes("test/page-reuse.test.js"));
  assert.ok(names.includes("test/openxml-core-package.test.js"));
  assert.ok(names.includes("test/openxml-build-jobs.test.js"));
  assert.ok(names.includes("test/page-semantic-claims.test.js"));
  assert.ok(names.includes("test/native-ownership-core-package.test.js"));
  assert.ok(names.includes("test/full-slide-residual-publication.test.js"));
  assert.ok(names.includes("test/full-slide-residual-crop.test.js"));
  assert.ok(names.includes("test/full-slide-residual-arc.test.js"));
  assert.ok(names.includes("test/raster-native-detection.test.js"));
  assert.ok(names.includes("test/pixel-diff-package.test.js"));
  assert.ok(integration.includes("test/libreoffice-core-package.test.js"));
  assert.ok(names.includes("test/diagram-text-candidates.test.js"));
  assert.ok(names.includes("test/common-tools-production-preflight.test.js"));
  assert.ok(names.includes("test/common-tools-team-runtime.test.js"));
  assert.ok(names.includes("test/team-config-boundary.test.js"));
  assert.ok(names.includes("test/job-input-boundary.test.js"));
  assert.ok(names.includes("test/cli-verification-package.test.js"));
  assert.ok(names.includes("test/redis-connection.test.js"));
  assert.ok(names.includes("test/page-text-finalizer.test.js"));
  assert.ok(names.includes("test/page-shape-finalizer.test.js"));
  assert.ok(names.includes("test/page-output-finalizer.test.js"));
  assert.ok(names.includes("test/retention-output-keys.test.js"));
  assert.ok(names.includes("test/native-rebuild-deck-pipeline.test.js"));
  assert.ok(names.includes("test/engineering-gate-coverage.test.js"));
  assert.ok(names.includes("test/worker-failure-boundary.test.js"));
  assert.ok(names.includes("test/workspace-boundary-verifier.test.js"));
  for (const name of ["page-selection-boundary", "ocr-source-deck", "graphic-crop-policy", "engine-core-package"]) assert.ok(names.includes(`test/${name}.test.js`));
});

test("local CI entry includes static gates and the actual lint/type commands include new boundaries", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(scripts["test:container-recovery"], "node --test test/container/worker-scratch-recovery.test.cjs");
  assert.ok(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8").includes("run: npm run test:container-recovery"));
  for (const command of ["lint", "typecheck", "common-tools:verify-plugins", "common-tools:verify-observability", "common-tools:verify-adrs", "test:unit", "test:contract", "test:integration"]) {
    assert.ok(scripts["verify:ci"].split(" && ").includes(`npm run ${command}`), command);
  }
  assert.ok(scripts.lint.includes("skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer.js"));
  assert.ok(scripts.lint.includes("skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice.js"));
  assert.ok(scripts.lint.includes("skills/pd-hifi-slideclone/scripts/lib/render-cache-metadata.js"));
  assert.ok(scripts.lint.includes("skills/pd-hifi-slideclone/scripts/lib/final-page-cache.js"));
  assert.ok(scripts.lint.split(" && ").includes("node scripts/verify-workspace-boundaries.js"));
  assert.ok(scripts.typecheck.split(" && ").includes("tsc --project tsconfig.boundaries.json"));
  const boundaries = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.boundaries.json"), "utf8"));
  assert.equal(boundaries.compilerOptions.strict, true);
  assert.ok(boundaries.include.includes("packages/team-runtime/job-input.js"));
  assert.ok(boundaries.include.includes("test/types/job-input.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/raster-native-detection.js"));
  assert.ok(boundaries.include.includes("test/types/raster-native-detection.ts"));
  assert.ok(boundaries.include.includes("packages/team-runtime/team-config.js"));
  assert.ok(boundaries.include.includes("test/types/team-config.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-output-finalizer.js"));
  assert.ok(boundaries.include.includes("test/types/page-output-finalizer.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-shape-finalizer.js"));
  assert.ok(boundaries.include.includes("test/types/page-shape-finalizer.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-text-finalizer.js"));
  assert.ok(boundaries.include.includes("test/types/page-text-finalizer.ts"));
  assert.ok(boundaries.include.includes("packages/remote-mcp-server/redis-connection.js"));
  assert.ok(boundaries.include.includes("test/types/redis-connection.ts"));
  assert.ok(boundaries.include.includes("packages/remote-mcp-server/worker-settings.js"));
  assert.ok(boundaries.include.includes("test/types/worker-settings.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/native-object-conflict-arbitrator.js"));
  assert.ok(boundaries.include.includes("test/types/native-object-conflict-arbitrator.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/native-rebuilder-policy.js"));
  assert.ok(boundaries.include.includes("test/types/native-rebuilder-policy.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/arc-residual-masks.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/native-output-sanitizer.js"));
  assert.ok(boundaries.include.includes("test/types/native-output-sanitizer.ts"));
  assert.ok(boundaries.include.includes("test/types/arc-residual-masks.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-semantic-claims.js"));
  assert.ok(boundaries.include.includes("test/types/page-semantic-claims.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/openxml-build-jobs.js"));
  assert.ok(boundaries.include.includes("test/types/openxml-build-jobs.ts"));
  assert.ok(boundaries.include.includes("packages/team-runtime/retention-output-keys.js"));
  assert.ok(boundaries.include.includes("packages/team-runtime/worker-lease.js"));
  assert.ok(boundaries.include.includes("test/types/worker-lease.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-progress-lifecycle.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-graphics-stage.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/slide-size.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/page-reuse.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/residual-publication.js"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/renderer-process.js"));
  assert.ok(boundaries.include.includes("test/types/renderer-process.ts"));
  assert.ok(boundaries.include.includes("test/types/residual-publication.ts"));
  assert.ok(boundaries.include.includes("test/types/page-reuse.ts"));
  assert.ok(boundaries.include.includes("packages/slideclone-core/diagram-text-candidates.js"));
  assert.ok(boundaries.include.includes("test/types/diagram-text-candidates.ts"));
  assert.ok(boundaries.include.includes("test/types/slide-size.ts"));
  assert.ok(boundaries.include.includes("test/types/page-graphics-stage.ts"));
  assert.ok(boundaries.include.includes("test/types/page-progress-lifecycle.ts"));
  assert.equal(scripts["test:linux-process-recovery"], "node --test test/linux/ocr-process-recovery.test.cjs");
  assert.equal(scripts["test:postgres-recovery"], "node --test test/postgres/lease-recovery.test.cjs");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.ok(workflow.includes("run: npm run test:linux-process-recovery"));
  assert.ok(workflow.includes("run: npm run test:postgres-recovery"));
  assert.equal(scripts["test:s3-retention"], "node --test test/s3/attempt-retention.test.cjs");
  assert.ok(workflow.includes("run: npm run test:s3-retention"));
  assert.ok(workflow.includes('common-tools:verify-release-evidence -- --sbom artifacts/common-tools.spdx.json --manifest artifacts/common-tools.release.json --revision "$env:GITHUB_SHA"'));
});
