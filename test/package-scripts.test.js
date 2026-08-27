"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadProfile } = require("../scripts/slideclone-profile");

function readPackageScripts() {
  const scripts = readRawPackageScripts();
  return Object.fromEntries(Object.entries(scripts).map(([name, command]) => {
    const match = /^node scripts\/slideclone-profile\.js ([a-z0-9-]+)$/u.exec(command);
    if (!match) return [name, command];
    const profile = loadProfile(match[1]);
    const script = path.relative(process.cwd(), profile.script).replace(/\\/gu, "/");
    const args = profile.args.map((argument) => /\s/u.test(argument) ? `"${argument}"` : argument);
    return [name, ["node", script, ...args].join(" ")];
  }));
}

function readRawPackageScripts() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  return packageJson.scripts || {};
}

test("package scripts expose OfficePLUS/iSlide component asset rebuild entrypoints", () => {
  const scripts = readPackageScripts();
  const rebuild = scripts["slideclone:component-strategy-rebuild-assets"];
  const quality = scripts["slideclone:component-strategy-rebuild-assets-quality"];

  for (const command of [rebuild, quality]) {
    assert.match(command, /component-strategy-rebuild\.js/);
    assert.match(command, /--component-assets true/);
    assert.match(command, /--harvest-islide-temp/);
    assert.match(command, /--component-inventory-cache runs\/plugin-component-inventory\/officeplus-islide-cache\.json/);
    assert.match(command, /--component-learning-cache runs\/plugin-component-inventory\/officeplus-islide-learning-cache\.json/);
    assert.match(command, /--objectify-component-group-matches true/);
    assert.match(command, /--component-group-match-min-score 72/);
  }

  assert.match(quality, /--quality true/);
});

test("package scripts expose active PowerPoint plugin component harvesting", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:harvest-active-ppt-component"];
  const resolve = scripts["slideclone:officeplus-resolve"];
  const resolveV17 = scripts["slideclone:officeplus-resolve-v17"];

  assert.match(command, /harvest-active-powerpoint-component\.js/);
  assert.match(resolve, /officeplus-component-resolve\.js/);
  assert.match(resolveV17, /officeplus-component-resolve\.js/);
  assert.match(resolveV17, /MatlComponentContent-1900/);
  assert.match(resolveV17, /MatlComponentContent-16000/);
});

test("package scripts expose active PPTX component library refresh", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-library-refresh-watch-active"];

  assert.match(command, /component-library-refresh\.js/);
  assert.match(command, /--watch-plugin-downloads/);
});

test("package scripts expose plugin component download watcher", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:watch-plugin-component-downloads"];

  assert.match(command, /watch-plugin-component-downloads\.js/);
});

test("package scripts expose active PPTX plugin component watcher", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:watch-active-pptx-component"];

  assert.match(command, /watch-plugin-component-downloads\.js/);
  assert.match(command, /--active-powerpoint/);
  assert.match(command, /--no-default-roots/);
});

test("package scripts expose OfficePLUS/iSlide component asset regression gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:quality-matrix-component-assets-regression"];

  assert.match(command, /real-pptx-quality-matrix\.js/);
  assert.match(command, /--comparison-manifest skills\/pd-hifi-slideclone\/examples\/component-assets-regression\.manifest\.json/);
  assert.match(command, /--out runs\/component-assets-regression-matrix\.json/);
  assert.match(command, /--fail-on-regression/);
});

test("package scripts expose batch native audit and golden-set gate entrypoints", () => {
  const scripts = readPackageScripts();
  const audit = scripts["slideclone:batch-native-audit-summary"];
  const minimumUnitGapAudit = scripts["slideclone:minimum-unit-gap-audit"];
  const minimumUnitGapRepairSmoke = scripts["slideclone:minimum-unit-gap-repair-smoke"];
  const minimumUnitGapRepairQueue = scripts["slideclone:minimum-unit-gap-repair-queue"];
  const minimumUnitGapRepairMerge = scripts["slideclone:minimum-unit-gap-repair-merge"];
  const minimumUnitGapVisualMatrix = scripts["slideclone:minimum-unit-gap-visual-matrix"];
  const gate = scripts["slideclone:batch-native-audit-golden-gate"];

  assert.match(audit, /batch-native-audit-summary\.js/);
  assert.match(minimumUnitGapAudit, /minimum-unit-gap-audit\.js/);
  assert.match(minimumUnitGapAudit, /--repair-queue-out runs\/minimum-unit-gap-repair-queue\.json/);
  assert.match(minimumUnitGapAudit, /--min-area-ratio 0\.18/);
  assert.match(minimumUnitGapRepairSmoke, /component-strategy-rebuild\.js/);
  assert.match(minimumUnitGapRepairSmoke, /--expression-policy-repair-queue runs\/minimum-unit-gap-repair-queue\.json/);
  assert.match(minimumUnitGapRepairSmoke, /--only PM_Portal_AI_Asset_Hub/);
  assert.match(minimumUnitGapRepairSmoke, /--pages 9/);
  assert.match(minimumUnitGapRepairSmoke, /--pptx-engine openxml/);
  assert.match(minimumUnitGapRepairQueue, /minimum-unit-gap-repair-runner\.js/);
  assert.match(minimumUnitGapRepairQueue, /--repair-queue runs\/minimum-unit-gap-repair-queue\.json/);
  assert.match(minimumUnitGapRepairQueue, /--max-pages 10/);
  assert.match(minimumUnitGapRepairQueue, /--deck-concurrency 2/);
  assert.match(minimumUnitGapRepairQueue, /--page-concurrency 2/);
  assert.match(minimumUnitGapRepairQueue, /--replace-safe-component-template-crops/);
  assert.match(minimumUnitGapRepairQueue, /--pptx-engine openxml/);
  assert.match(minimumUnitGapRepairMerge, /minimum-unit-gap-repair-merge\.js/);
  assert.match(minimumUnitGapRepairMerge, /--base-ir-dir ppt文档\/组件策略插件增强版本/);
  assert.match(minimumUnitGapRepairMerge, /--repair-root runs\/minimum-unit-gap-repair-queue-pptx/);
  assert.match(minimumUnitGapRepairMerge, /--out runs\/minimum-unit-gap-repair-merged/);
  assert.match(minimumUnitGapRepairMerge, /--pptx-engine openxml/);
  assert.match(minimumUnitGapVisualMatrix, /real-pptx-quality-matrix\.js/);
  assert.match(minimumUnitGapVisualMatrix, /--root runs\/quality-gate-visual-minimum-unit-merged-all/);
  assert.match(minimumUnitGapVisualMatrix, /--max-deck-pixel-diff-ratio 0\.12/);
  assert.match(minimumUnitGapVisualMatrix, /--max-deck-foreground-missing-ratio 0\.14/);
  assert.match(minimumUnitGapVisualMatrix, /--max-average-pixel-diff-ratio 0\.08/);
  assert.match(minimumUnitGapVisualMatrix, /--max-average-foreground-missing-ratio 0\.10/);
  assert.match(minimumUnitGapVisualMatrix, /--min-compared-pages 76/);
  assert.match(minimumUnitGapVisualMatrix, /--require-no-actionable-unexplained-crops true/);
  assert.match(gate, /batch-native-audit-summary\.js/);
  assert.match(gate, /--ir-dir ppt文档\/组件策略插件增强版本/);
  assert.match(gate, /--max-protected-crop-area-ratio 0\.28/);
  assert.match(gate, /--min-decks 10/);
  assert.match(gate, /--min-pages 20/);
});

test("package scripts expose a fast graphics reconstruction verification shard", () => {
  const scripts = readPackageScripts();
  const command = scripts["verify:slideclone-graphics"];

  assert.match(command, /node --test/);
  assert.match(command, /test\/batch-native-audit-summary\.test\.js/);
  assert.match(command, /test\/graphic-reconstruction-decision-audit\.test\.js/);
  assert.match(command, /test\/graphic-reconstruction-decision-gate\.test\.js/);
  assert.match(command, /test\/expression-policy-repair-queue\.test\.js/);
  assert.match(command, /test\/component-strategy-rebuild\.test\.js/);
  assert.match(command, /test\/minimum-unit-policy-gate\.test\.js/);
  assert.match(command, /test\/minimum-unit-gap-audit\.test\.js/);
  assert.match(command, /test\/minimum-unit-gap-repair-runner\.test\.js/);
  assert.match(command, /test\/minimum-unit-gap-repair-merge\.test\.js/);
  assert.match(command, /test\/native-fragmentation-audit\.test\.js/);
  assert.match(command, /test\/component-render-strategy\.test\.js/);
  assert.match(command, /test\/visual-atoms\.test\.js/);
  assert.match(command, /test\/quality-gate-ocr-batch\.test\.js/);
  assert.match(command, /test\/quality-gate-real-pptx\.test\.js/);
  assert.match(command, /test\/real-pptx-quality-matrix\.test\.js/);
});

test("package scripts expose component acquisition search entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-acquisition-search"];
  const repairCoverage = scripts["slideclone:component-acquisition-search-repair-coverage"];

  assert.match(command, /component-acquisition-search\.js/);
  assert.match(repairCoverage, /component-acquisition-search\.js/);
  assert.match(repairCoverage, /--repair-coverage runs\/expression-policy-repair-queue-quality-coverage\.json/);
  assert.match(repairCoverage, /--out runs\/plugin-component-inventory\/component-acquisition-search-repair-coverage\.json/);
});

test("package scripts expose plugin component action queue entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-plugin-action-queue"];
  const repairCoverage = scripts["slideclone:component-plugin-action-queue-repair-coverage"];
  const v17 = scripts["slideclone:component-plugin-action-queue-v17"];

  assert.match(command, /component-plugin-action-queue\.js/);
  assert.match(repairCoverage, /component-plugin-action-queue\.js/);
  assert.match(repairCoverage, /--repair-coverage runs\/expression-policy-repair-queue-quality-coverage\.json/);
  assert.match(repairCoverage, /--markdown-out runs\/plugin-component-inventory\/component-plugin-action-queue-repair-coverage\.md/);
  assert.match(v17, /component-plugin-action-queue\.js/);
  assert.match(v17, /--harvest-shortlist/);
  assert.match(v17, /--officeplus-resolve/);
  assert.match(v17, /component-harvest-shortlist\.json/);
  assert.match(v17, /--max-actions 4/);
});

test("package scripts expose plugin component apply session entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-plugin-apply-session"];
  const repairCoverageGuide = scripts["slideclone:component-plugin-apply-session-repair-coverage-guide"];
  const guide = scripts["slideclone:component-plugin-apply-session-v17-guide"];
  const watch = scripts["slideclone:component-plugin-apply-session-v17-watch"];

  assert.match(command, /component-plugin-apply-session\.js/);
  assert.match(repairCoverageGuide, /component-plugin-apply-session\.js/);
  assert.match(repairCoverageGuide, /--queue runs\/plugin-component-inventory\/component-plugin-action-queue-repair-coverage\.json/);
  assert.match(repairCoverageGuide, /--no-watch/);
  assert.match(repairCoverageGuide, /--no-refresh-inventory/);
  assert.match(guide, /component-plugin-apply-session\.js/);
  assert.match(guide, /--duration-ms 0/);
  assert.match(guide, /--no-watch/);
  assert.match(watch, /component-plugin-apply-session\.js/);
  assert.match(watch, /--duration-ms 60000/);
  assert.match(watch, /--watch-provider officeplus/);
});

test("package scripts expose isolated plugin component collection entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-isolated-collection"];

  assert.match(command, /component-isolated-collection-session\.js/);
});

test("package scripts expose the high-frequency plugin component learning wave", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-learning-wave"];

  assert.match(command, /component-learning-wave\.js/);
});

test("package scripts expose repair coverage component harvest queue entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-replacement-harvest-queue-repair-coverage"];

  assert.match(command, /component-replacement-harvest-queue\.js/);
  assert.match(command, /--apply-session runs\/plugin-component-inventory\/plugin-apply-session-repair-coverage-guide\/plugin-apply-session\.json/);
  assert.match(command, /--markdown-out runs\/plugin-component-inventory\/component-replacement-harvest-queue-repair-coverage\.md/);
});

test("package scripts expose repair coverage IR replacement plan entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-ir-replacement-plan-repair-coverage"];

  assert.match(command, /component-ir-replacement-plan\.js/);
  assert.match(command, /--harvest-queue runs\/plugin-component-inventory\/component-replacement-harvest-queue-repair-coverage\.json/);
  assert.match(command, /--ir-dir ppt文档\/组件策略插件增强版本/);
  assert.match(command, /--inventory runs\/plugin-component-inventory\/latest-inventory\.json/);
  assert.match(command, /--markdown-out runs\/plugin-component-inventory\/component-ir-replacement-plan-repair-coverage\.md/);
  assert.match(command, /--fail-on-missing-targets/);
});

test("package scripts expose repair coverage ready-only IR replacement close loop", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-ir-replacement-close-loop-repair-coverage-ready"];

  assert.match(command, /component-ir-replacement-close-loop\.js/);
  assert.match(command, /--harvest-queue runs\/plugin-component-inventory\/component-replacement-harvest-queue-repair-coverage\.json/);
  assert.match(command, /--inventory runs\/plugin-component-inventory\/learned-islide-card-grid\/inventory\.json/);
  assert.match(command, /--allow-pending-samples/);
  assert.match(command, /--object-audit/);
  assert.match(command, /--min-applied-count 3/);
  assert.match(command, /--strict-geometry/);
  assert.match(command, /--visual-audit/);
  assert.match(command, /--visual-renderer powerpoint/);
  assert.match(command, /--visual-page-budget 2/);
});

test("package scripts expose repair coverage component bridge pipeline", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:repair-coverage-component-bridge"];

  assert.match(command, /slideclone:component-plugin-action-queue-repair-coverage/);
  assert.match(command, /slideclone:component-plugin-apply-session-repair-coverage-guide/);
  assert.match(command, /slideclone:component-replacement-harvest-queue-repair-coverage/);
  assert.match(command, /slideclone:component-ir-replacement-plan-repair-coverage/);
});

test("package scripts expose plugin component apply session gate entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-plugin-apply-session-gate"];

  assert.match(command, /component-plugin-apply-session-gate\.js/);
});

test("package scripts expose OfficePLUS/iSlide component asset coverage gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-assets-coverage-gate"];

  assert.match(command, /component-coverage-matrix\.js/);
  assert.match(command, /--coverage-manifest skills\/pd-hifi-slideclone\/examples\/component-assets-coverage\.manifest\.json/);
  assert.match(command, /--out runs\/component-assets-coverage-matrix\.json/);
  assert.match(command, /--fail-on-coverage-gap/);
});

test("package scripts expose expression policy repair queue entrypoints", () => {
  const scripts = readPackageScripts();
  const generic = scripts["slideclone:expression-policy-repair-queue"];
  const assets = scripts["slideclone:expression-policy-repair-queue-assets"];
  const batch = scripts["slideclone:expression-policy-repair-queue-batch"];
  const quality = scripts["slideclone:expression-policy-repair-queue-quality"];
  const qualityCoverage = scripts["slideclone:expression-policy-repair-queue-quality-coverage"];

  assert.match(generic, /expression-policy-repair-queue\.js/);
  assert.match(assets, /expression-policy-repair-queue\.js/);
  assert.match(assets, /--coverage-matrix runs\/component-assets-coverage-matrix\.json/);
  assert.match(assets, /--markdown-out runs\/expression-policy-repair-queue\.md/);
  assert.match(batch, /--batch-native-audit runs\/batch-native-audit-for-repair\.json/);
  assert.match(batch, /--out runs\/expression-policy-repair-queue-batch\.json/);
  assert.match(quality, /--quality-matrix runs\/quality-matrix-enhanced-visual\.json/);
  assert.match(quality, /--markdown-out runs\/expression-policy-repair-queue-quality\.md/);
  assert.match(qualityCoverage, /expression-policy-repair-queue-coverage\.js/);
  assert.match(qualityCoverage, /--repair-queue runs\/expression-policy-repair-queue-quality\.json/);
  assert.match(qualityCoverage, /--parallel-report ppt文档\/组件策略插件增强版本\/component-strategy-rebuild-parallel-report\.json/);
});

test("package scripts expose a batch audit driven component strategy repair loop", () => {
  const scripts = readPackageScripts();
  const audit = scripts["slideclone:batch-native-audit-for-repair"];
  const rebuild = scripts["slideclone:component-strategy-rebuild-assets-native-turbo-repaired"];
  const loop = scripts["slideclone:component-strategy-repair-loop"];

  assert.match(audit, /batch-native-audit-summary\.js/);
  assert.match(audit, /--out runs\/batch-native-audit-for-repair\.json/);
  assert.match(audit, /--no-fail/);
  assert.match(rebuild, /component-strategy-rebuild-parallel\.js/);
  assert.match(rebuild, /--expression-policy-repair-queue runs\/expression-policy-repair-queue-batch\.json/);
  assert.match(rebuild, /组件策略插件增强版本-native-repaired/);
  assert.equal(
    loop,
    "npm run slideclone:batch-native-audit-for-repair && npm run slideclone:expression-policy-repair-queue-batch && npm run slideclone:component-strategy-rebuild-assets-native-turbo-repaired"
  );
});

test("package scripts expose a combined OfficePLUS/iSlide component asset golden gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-assets-golden-gate"];

  assert.equal(
    command,
    "npm run slideclone:quality-matrix-component-assets-regression && npm run slideclone:component-assets-coverage-gate"
  );
});

test("package scripts expose a parallel OfficePLUS/iSlide component asset golden gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-assets-golden-gate-fast"];

  assert.equal(
    command,
    "node skills/pd-hifi-slideclone/scripts/component-assets-golden-gate.js"
  );
});

test("package scripts expose a parallel OCR quality gate for enhanced component decks", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:quality-gate-ocr-batch-enhanced-turbo"];

  assert.match(command, /quality-gate-ocr-batch\.js/);
  assert.match(command, /--input ppt文档\/组件策略插件增强版本/);
  assert.match(command, /--out runs\/quality-gate-ocr-batch-enhanced-turbo/);
  assert.match(command, /--concurrency 2/);
  assert.match(command, /--text-ocr-adapter scripts\/adapters\/ocr-paddleocr-local\.js/);
  assert.match(command, /--text-ocr-pages auto/);
  assert.match(command, /--renderer powerpoint/);
  assert.match(command, /--reuse-render true/);
});

test("package scripts make anchored Umi OCR the representative Chinese text gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:quality-gate-ocr-batch-umi-representative"];

  assert.match(command, /quality-gate-ocr-batch\.js/);
  assert.match(command, /--concurrency 2/);
  assert.match(command, /--text-ocr-adapter scripts\/adapters\/ocr-umi-paddle\.js/);
  assert.match(command, /--text-ocr-mode anchored/);
  assert.match(command, /--text-ocr-pages auto/);
  assert.match(command, /--text-ocr-padding 16/);
  assert.match(command, /--min-text-coverage 0\.80/);
  assert.match(command, /--renderer powerpoint/);
  assert.match(command, /--reuse-render true/);
  assert.doesNotMatch(command, /--text-ocr-mode fullPage/);
});

test("package scripts pass PaddleOCR gate options after the profile separator", () => {
  const scripts = readPackageScripts();
  const batch = scripts["slideclone:quality-gate-ocr-batch-paddleocr"];
  const single = scripts["slideclone:quality-gate-real-pptx-paddleocr"];

  assert.match(batch, /quality-gate-ocr-batch -- --text-ocr-adapter/);
  assert.match(batch, /scripts\/adapters\/ocr-paddleocr-local\.js/);
  assert.match(single, /quality-gate-real-pptx -- --text-ocr true/);
  assert.match(single, /scripts\/adapters\/ocr-paddleocr-local\.js/);
});

test("package scripts expose a fast visual-only quality gate for enhanced component decks", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:quality-gate-visual-batch-enhanced-turbo"];

  assert.match(command, /quality-gate-ocr-batch\.js/);
  assert.match(command, /--input ppt文档\/组件策略插件增强版本/);
  assert.match(command, /--out runs\/quality-gate-visual-batch-enhanced-turbo/);
  assert.match(command, /--concurrency 2/);
  assert.match(command, /--text-ocr false/);
  assert.match(command, /--renderer powerpoint/);
  assert.match(command, /--reuse-render true/);
  assert.doesNotMatch(command, /--text-ocr-pages auto/);
  assert.doesNotMatch(command, /--min-text-coverage/);
});

test("package scripts expose isolated visual quality matrix gates", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:quality-matrix-enhanced-visual-gate"];
  const combined = scripts["slideclone:enhanced-visual-quality-gate"];

  assert.match(command, /real-pptx-quality-matrix\.js/);
  assert.match(command, /--root runs\/quality-gate-visual-batch-enhanced-turbo/);
  assert.match(command, /--out runs\/quality-matrix-enhanced-visual\.json/);
  assert.match(command, /--require-no-residual-layer-candidates true/);
  assert.match(command, /--require-no-actionable-unexplained-crops true/);
  assert.match(command, /--fail-on-regression/);
  assert.doesNotMatch(command, /--require-no-text-overlay-risk/);
  assert.equal(
    combined,
    "npm run slideclone:quality-gate-visual-batch-enhanced-turbo && npm run slideclone:quality-matrix-enhanced-visual-gate"
  );
});

test("package scripts expose a turbo real PPTX ingestion path for large single decks", () => {
  const scripts = readRawPackageScripts();
  const command = scripts["slideclone:convert-real-pptx-turbo"];
  const profile = loadProfile("convert-real-pptx-turbo");

  assert.equal(command, "node scripts/slideclone-profile.js convert-real-pptx-turbo");
  assert.equal(path.basename(profile.script), "real-pptx-editable-batch.js");
  assert.deepEqual(profile.args, [
    "--input", "ppt文档",
    "--out", "ppt文档/可编辑版本",
    "--concurrency", "2",
    "--page-concurrency", "3",
    "--heartbeat-ms", "15000"
  ]);
});

test("package scripts expose a native component promotion gate", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-native-promotion-gate"];
  const strict = scripts["slideclone:component-native-promotion-gate-strict"];
  const batch = scripts["slideclone:component-native-promotion-batch"];
  const materialize = scripts["slideclone:component-native-promotion-materialize"];

  assert.match(command, /component-native-promotion-gate\.js/);
  assert.match(strict, /component-native-promotion-gate\.js/);
  assert.match(strict, /--require-actionable-retained-reduction/);
  assert.match(strict, /--min-actionable-retained-reduction 1/);
  assert.match(batch, /component-native-promotion-batch\.js/);
  assert.match(materialize, /component-native-promotion-batch\.js/);
  assert.match(materialize, /--require-actionable-retained-reduction/);
  assert.match(materialize, /--min-actionable-retained-reduction 1/);
});

test("package scripts expose a parallel component strategy rebuild entrypoint", () => {
  const scripts = readPackageScripts();
  const command = scripts["slideclone:component-strategy-rebuild-parallel"];

  assert.match(command, /component-strategy-rebuild-parallel\.js/);
  assert.match(command, /--work-root ppt文档\/可编辑版本/);
  assert.match(command, /--out ppt文档\/组件策略可编辑版本/);
  assert.match(command, /--concurrency 2/);
});

test("package scripts expose fast cached component strategy rebuild entrypoints", () => {
  const scripts = readPackageScripts();
  const full = scripts["slideclone:component-strategy-rebuild-fast"];
  const irOnly = scripts["slideclone:component-strategy-rebuild-ir-fast"];
  const cached = scripts["slideclone:component-strategy-rebuild-cached"];
  const cachedIrOnly = scripts["slideclone:component-strategy-rebuild-ir-cached"];
  const qualitySmoke = scripts["slideclone:component-strategy-rebuild-quality-smoke"];

  for (const command of [full, irOnly, cached, cachedIrOnly, qualitySmoke]) {
    assert.match(command, /component-strategy-rebuild-parallel\.js/);
    assert.match(command, /--concurrency 2/);
    assert.match(command, /--reuse-analysis/);
    assert.match(command, /--reuse-final-page-cache/);
  }

  assert.match(full, /--pptx-engine openxml/);
  assert.match(irOnly, /--skip-pptx/);
  assert.match(cached, /--reuse-final-ir/);
  assert.match(cached, /--pptx-engine openxml/);
  assert.match(cachedIrOnly, /--reuse-final-ir/);
  assert.match(cachedIrOnly, /--skip-pptx/);
  assert.match(qualitySmoke, /--quality true/);
  assert.match(qualitySmoke, /--quality-max-pages 2/);
});

test("package scripts expose parallel OfficePLUS/iSlide enhanced rebuild entrypoints", () => {
  const scripts = readPackageScripts();
  const full = scripts["slideclone:component-strategy-rebuild-assets-fast"];
  const irOnly = scripts["slideclone:component-strategy-rebuild-assets-ir-fast"];
  const cached = scripts["slideclone:component-strategy-rebuild-assets-cached"];
  const turbo = scripts["slideclone:component-strategy-rebuild-assets-turbo"];
  const irTurbo = scripts["slideclone:component-strategy-rebuild-assets-ir-turbo"];
  const nativeTurbo = scripts["slideclone:component-strategy-rebuild-assets-native-turbo"];

  for (const command of [full, irOnly, cached, turbo, irTurbo, nativeTurbo]) {
    assert.match(command, /component-strategy-rebuild-parallel\.js/);
    assert.match(command, /--reuse-analysis/);
    assert.match(command, /--component-assets true/);
    assert.match(command, /--harvest-islide-temp/);
    assert.match(command, /--component-inventory-cache runs\/plugin-component-inventory\/officeplus-islide-cache\.json/);
    assert.match(command, /--component-learning-cache runs\/plugin-component-inventory\/officeplus-islide-learning-cache\.json/);
    assert.match(command, /--objectify-component-group-matches true/);
  }

  for (const command of [full, irOnly, cached, turbo, irTurbo]) {
    assert.match(command, /--out ppt文档\/组件策略插件增强版本/);
  }

  for (const command of [full, irOnly, cached]) {
    assert.match(command, /--concurrency 2/);
  }

  assert.match(full, /--pptx-engine openxml/);
  assert.match(irOnly, /--skip-pptx/);
  assert.match(cached, /--reuse-final-ir/);
  assert.match(turbo, /--concurrency 4/);
  assert.match(turbo, /--pptx-engine openxml/);
  assert.match(turbo, /--heartbeat-ms 15000/);
  assert.match(irTurbo, /--concurrency 4/);
  assert.match(irTurbo, /--skip-pptx/);
  assert.match(irTurbo, /--heartbeat-ms 15000/);
  assert.match(nativeTurbo, /--out ppt文档\/组件策略插件增强版本-native/);
  assert.match(nativeTurbo, /--concurrency 4/);
  assert.match(nativeTurbo, /--replace-safe-component-template-crops true/);
  assert.match(nativeTurbo, /--pptx-engine openxml/);
});

test("package scripts expose turbo page-sharded OfficePLUS/iSlide one-deck rebuild entrypoints", () => {
  const scripts = readPackageScripts();
  const irTurbo = scripts["slideclone:component-strategy-rebuild-assets-ir-one-deck-turbo"];
  const nativeTurbo = scripts["slideclone:component-strategy-rebuild-assets-native-one-deck-turbo"];

  for (const command of [irTurbo, nativeTurbo]) {
    assert.match(command, /component-strategy-rebuild-page-shards\.js/);
    assert.match(command, /--work-root ppt文档\/可编辑版本/);
    assert.match(command, /--concurrency 4/);
    assert.match(command, /--page-shard-size 1/);
    assert.match(command, /--reuse-analysis/);
    assert.match(command, /--reuse-final-page-cache/);
    assert.match(command, /--component-assets true/);
    assert.match(command, /--harvest-islide-temp/);
    assert.match(command, /--component-inventory-cache runs\/plugin-component-inventory\/officeplus-islide-cache\.json/);
    assert.match(command, /--component-learning-cache runs\/plugin-component-inventory\/officeplus-islide-learning-cache\.json/);
    assert.match(command, /--objectify-component-group-matches true/);
    assert.match(command, /--heartbeat-ms 5000/);
  }

  assert.match(irTurbo, /--out runs\/one-deck-page-shards-ir-turbo/);
  assert.match(irTurbo, /--skip-pptx/);
  assert.match(nativeTurbo, /--out ppt文档\/组件策略插件增强版本-one-deck-native/);
  assert.match(nativeTurbo, /--pptx-engine openxml/);
});

test("package scripts expose component replacement close-loop smoke and gates", () => {
  const scripts = readPackageScripts();
  const smoke = scripts["slideclone:component-replacement-close-loop-smoke"];
  const gate = scripts["slideclone:component-replacement-close-loop-gate-smoke"];
  const allowGate = scripts["slideclone:component-replacement-close-loop-gate-smoke-allow"];
  const qualityGate = scripts["slideclone:component-replacement-close-loop-gate-quality"];
  const harvestRefresh = scripts["slideclone:component-replacement-harvest-refresh"];
  const harvestRefreshV17 = scripts["slideclone:component-replacement-harvest-refresh-v17"];

  assert.match(smoke, /component-replacement-close-loop\.js/);
  assert.match(smoke, /--input runs\/component-replacement-batch-smoke-input/);
  assert.match(smoke, /--inventory runs\/plugin-component-inventory\/officeplus-islide-cache\.json/);
  assert.match(smoke, /--out runs\/component-replacement-close-loop-smoke/);
  assert.match(gate, /component-replacement-close-loop-gate\.js/);
  assert.match(gate, /component-replacement-close-loop-report\.json/);
  assert.doesNotMatch(gate, /--allow-needs-harvest/);
  assert.match(allowGate, /--allow-needs-harvest/);
  assert.match(qualityGate, /component-replacement-close-loop-gate\.js/);
  assert.match(qualityGate, /--quality-matrix runs\/component-assets-regression-matrix\.json/);
  assert.match(qualityGate, /--min-applied-count 1/);
  assert.match(harvestRefresh, /component-replacement-harvest-refresh\.js/);
  assert.match(harvestRefreshV17, /component-replacement-harvest-refresh\.js/);
  assert.match(harvestRefreshV17, /--decision-search-candidates/);
  assert.match(harvestRefreshV17, /--min-decision-plugin-targets 8/);
  assert.match(harvestRefreshV17, /--min-decision-protected-crops 2/);
  assert.match(harvestRefreshV17, /--max-decision-actionable-gaps 0/);
});
