"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  FINAL_PAGE_RULESET_VERSION,
  buildFinalPageCacheKey,
  finalPageCacheImplementationFingerprint,
  finalPageCachePageImplementationFingerprint,
  finalPageCacheOptionsSignature,
  fingerprintFiles,
  readFinalPageCache,
  resolveDefaultFinalPageCacheDir,
  stableJson,
  writeFinalPageCache
} = require("../skills/pd-hifi-slideclone/scripts/lib/final-page-cache");

test("final page cache implementation fingerprints use file content, not a coarse timestamp", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-cache-fingerprint-"));
  const first = path.join(root, "first.js");
  const second = path.join(root, "second.js");
  fs.writeFileSync(first, "const value = 'one';\n");
  fs.writeFileSync(second, "const value = 'two';\n");
  const timestamp = new Date("2026-07-24T00:00:00.000Z");
  fs.utimesSync(first, timestamp, timestamp);
  fs.utimesSync(second, timestamp, timestamp);

  assert.notEqual(fingerprintFiles([first], root), fingerprintFiles([second], root));
});

test("final page cache key includes native rebuild ruleset version", () => {
  const input = {
    workDir: "ppt文档/可编辑版本/example.work",
    pageIndex: 4,
    page: {
      pageIndex: 4,
      images: [],
      shapes: [],
      textBoxes: [{ text: "业务截图", box: { x: 99, y: 288, w: 77, h: 21 } }]
    },
    slideSize: { widthPt: 960, heightPt: 540 },
    imageFile: "",
    options: {
      deckName: "example",
      componentGroupMatchMinScore: 72
    }
  };

  const currentKey = buildFinalPageCacheKey(input);
  const changedRulesKey = buildFinalPageCacheKey({
    ...input,
    options: {
      ...input.options,
      nativeRebuildRulesetVersion: "future-native-rebuild-rules"
    }
  });

  assert.notEqual(currentKey, changedRulesKey);
  assert.match(currentKey, /^[a-f0-9]{64}$/);
  assert.match(changedRulesKey, /^[a-f0-9]{64}$/);
});

test("final page cache option signature defaults to current ruleset version", () => {
  const signature = finalPageCacheOptionsSignature({});

  assert.equal(signature.nativeRebuildRulesetVersion, FINAL_PAGE_RULESET_VERSION);
  assert.match(signature.implementationFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(signature.implementationFingerprint, finalPageCacheImplementationFingerprint());
  assert.ok(stableJson(signature).includes(FINAL_PAGE_RULESET_VERSION));
});

test("final page cache supports explicit implementation invalidation and a shared default directory", () => {
  const base = finalPageCacheOptionsSignature({});
  const changed = finalPageCacheOptionsSignature({ implementationFingerprint: "f".repeat(64) });

  assert.notEqual(base.implementationFingerprint, changed.implementationFingerprint);
  assert.equal(changed.implementationFingerprint, "f".repeat(64));
  assert.equal(resolveDefaultFinalPageCacheDir("C:\\workspace"), path.resolve("C:\\workspace", "runs", "slideclone-final-page-cache"));
});

test("final page cache separates every structure-changing native policy", () => {
  const baseline = stableJson(finalPageCacheOptionsSignature({}));
  const policies = [
    "objectifyAssetHubOutputIcons",
    "replaceSafeComponentTemplateCrops",
    "allowUnverifiedAppliedPluginPrototypeReplay",
    "hybridComponentTemplateResiduals",
    "eraseSpecializedHybridResidualText",
    "allowAssetOsDemandUnderstandingNativeApproximation",
    "allowEntropyChallengeNativeApproximation",
    "allowProductCollaborationChallengeNativeApproximation"
  ];

  for (const policy of policies) {
    assert.notEqual(stableJson(finalPageCacheOptionsSignature({ [policy]: true })), baseline, policy);
  }
});

test("final page cache scopes demand funnel adapter changes to matching pages", () => {
  const genericPage = { textBoxes: [{ text: "普通标题" }] };
  const funnelPage = {
    textBoxes: [
      { text: "需求理解：从杂乱信息到结构化输入" },
      { text: "会议纪要" },
      { text: "业务描述" },
      { text: "竞品截图" },
      { text: "需求理解 Skill" }
    ]
  };

  const genericFingerprint = finalPageCachePageImplementationFingerprint(genericPage);
  const funnelFingerprint = finalPageCachePageImplementationFingerprint(funnelPage);

  assert.match(genericFingerprint, /^[a-f0-9]{64}$/);
  assert.match(funnelFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(genericFingerprint, funnelFingerprint);
});

test("final page cache scopes the product-manager friction adapter to its semantic page", () => {
  const genericPage = { textBoxes: [{ text: "产品经理工作台" }] };
  const frictionPage = {
    textBoxes: [
      { text: "产品经理日常工作中的高频摩擦" },
      { text: "会议记录" },
      { text: "业务截图" },
      { text: "旧版 PRD" },
      { text: "口头反馈" },
      { text: "理解偏差" },
      { text: "重复返工" },
      { text: "风险遗漏" },
      { text: "产品交付" }
    ]
  };

  assert.notEqual(
    finalPageCachePageImplementationFingerprint(genericPage),
    finalPageCachePageImplementationFingerprint(frictionPage)
  );
});

test("final page cache scopes the fragmented asset chain adapter to its semantic page", () => {
  const genericPage = { textBoxes: [{ text: "产研资产管理" }] };
  const fragmentedPage = {
    textBoxes: [
      { text: "系统爆炸时代" },
      { text: "飞书会议记录" },
      { text: "旧版 PRD" },
      { text: "口头反馈" },
      { text: "业务截图" },
      { text: "理解偏差" },
      { text: "重复返工" },
      { text: "风险遗漏" },
      { text: "交付看板" }
    ]
  };

  assert.notEqual(
    finalPageCachePageImplementationFingerprint(genericPage),
    finalPageCachePageImplementationFingerprint(fragmentedPage)
  );
});

test("final page cache scopes the visual operation sync adapter to its semantic page", () => {
  const genericPage = { textBoxes: [{ text: "操作手册" }] };
  const syncPage = {
    textBoxes: [
      { text: "视觉还原与操作同步" },
      { text: "Gem 提炼" },
      { text: "形态转换引擎" },
      { text: "可点击交互原型" },
      { text: "自动截屏操作手册" },
      { text: "PM Portal" },
      { text: "门户展示" }
    ]
  };

  assert.notEqual(
    finalPageCachePageImplementationFingerprint(genericPage),
    finalPageCachePageImplementationFingerprint(syncPage)
  );
});

test("final page cache scopes workflow cover typography to its semantic page", () => {
  const genericPage = { textBoxes: [{ text: "产品能力概览" }] };
  const coverPage = {
    textBoxes: [
      { text: "AI Skills 核心能力矩阵" },
      { text: "重塑产品交付工作流 —— 从经验依赖到数智赋能" }
    ]
  };

  assert.notEqual(
    finalPageCachePageImplementationFingerprint(genericPage),
    finalPageCachePageImplementationFingerprint(coverPage)
  );
});

test("final page cache scopes collaboration multiplier tuning to its semantic diagram", () => {
  const genericPage = { textBoxes: [{ text: "研发协同概览" }] };
  const collaborationPage = {
    textBoxes: [
      { text: "协同倍增器：下游研发视角的隐藏红利" },
      { text: "To 后端研发 BE" },
      { text: "To 前端研发 FE" },
      { text: "To 测试 QA" }
    ]
  };

  const genericFingerprint = finalPageCachePageImplementationFingerprint(genericPage);
  const collaborationFingerprint = finalPageCachePageImplementationFingerprint(collaborationPage);

  assert.match(collaborationFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(genericFingerprint, collaborationFingerprint);
});

test("final page cache scopes WMS route-chain tuning to its semantic diagram", () => {
  const genericPage = { textBoxes: [{ text: "物流业务流程概览" }] };
  const wmsPage = {
    textBoxes: [
      { text: "场景实战 II：物流 WMS 复杂主链路增量" },
      { text: "WMS Inbound" },
      { text: "Tollgate 1" },
      { text: "挑战" },
      { text: "AI介入" },
      { text: "价值落地" }
    ]
  };

  const genericFingerprint = finalPageCachePageImplementationFingerprint(genericPage);
  const wmsFingerprint = finalPageCachePageImplementationFingerprint(wmsPage);

  assert.match(wmsFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(genericFingerprint, wmsFingerprint);
});

test("final page cache scopes KPI evidence tuning to its semantic page", () => {
  const genericPage = { textBoxes: [{ text: "数据业务指标概览" }] };
  const kpiPage = {
    textBoxes: [
      { text: "数据见证：从概念试点到规模化企业底座" },
      { text: "9大" },
      { text: "15个" },
      { text: "500+份" },
      { text: "400+个" }
    ]
  };

  const genericFingerprint = finalPageCachePageImplementationFingerprint(genericPage);
  const kpiFingerprint = finalPageCachePageImplementationFingerprint(kpiPage);

  assert.match(kpiFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(genericFingerprint, kpiFingerprint);
});

test("final page cache carries relative crop assets across output directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-page-cache-"));
  const firstIrDir = path.join(root, "v1");
  const secondIrDir = path.join(root, "v2");
  const cacheDir = path.join(root, "cache");
  const relativeAsset = "deck.assets/page-01-icon.png";
  fs.mkdirSync(path.join(firstIrDir, "deck.assets"), { recursive: true });
  fs.writeFileSync(path.join(firstIrDir, relativeAsset), "crop-bytes");
  const pageDraft = { images: [{ id: "icon", assetPath: relativeAsset }] };
  const key = "a".repeat(64);

  assert.equal(writeFinalPageCache({ cacheDir, key, pageDraft, irDir: firstIrDir }), true);
  assert.deepEqual(readFinalPageCache({ cacheDir, key, irDir: secondIrDir }), pageDraft);
  assert.equal(fs.readFileSync(path.join(secondIrDir, relativeAsset), "utf8"), "crop-bytes");
});

test("final page cache key is portable across workspaces and bound to source image content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-portable-cache-"));
  try {
    const first = path.join(root, "workspace-a");
    const second = path.join(root, "workspace-b");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    const firstImage = path.join(first, "page.png");
    const secondImage = path.join(second, "page.png");
    fs.writeFileSync(firstImage, "same-pixels");
    fs.writeFileSync(secondImage, "same-pixels");
    const page = { pageIndex: 0, sourceImage: "page.png", textBoxes: [{ text: "same" }], images: [] };
    const common = { page, pageIndex: 0, slideSize: { widthPt: 960, heightPt: 540 }, options: { deckName: "deck", implementationFingerprint: "f".repeat(64) } };
    assert.equal(
      buildFinalPageCacheKey({ ...common, workDir: first, imageFile: firstImage }),
      buildFinalPageCacheKey({ ...common, workDir: second, imageFile: secondImage })
    );
    fs.writeFileSync(secondImage, "changed-pixels");
    assert.notEqual(
      buildFinalPageCacheKey({ ...common, workDir: first, imageFile: firstImage }),
      buildFinalPageCacheKey({ ...common, workDir: second, imageFile: secondImage })
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("final page cache refuses a corrupted cached asset", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-cache-integrity-"));
  try {
    const irDir = path.join(root, "ir");
    const restoreDir = path.join(root, "restore");
    const cacheDir = path.join(root, "cache");
    const relativeAsset = "deck.assets/icon.png";
    fs.mkdirSync(path.join(irDir, "deck.assets"), { recursive: true });
    fs.writeFileSync(path.join(irDir, relativeAsset), "original");
    const key = "c".repeat(64);
    const pageDraft = { images: [{ id: "icon", assetPath: relativeAsset }] };
    assert.equal(writeFinalPageCache({ cacheDir, key, pageDraft, irDir }), true);
    fs.writeFileSync(path.join(cacheDir, `${key}.assets`, relativeAsset), "corrupt");
    assert.equal(readFinalPageCache({ cacheDir, key, irDir: restoreDir }), null);
    assert.equal(fs.existsSync(path.join(restoreDir, relativeAsset)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("final page cache rejects relative asset traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-page-cache-traversal-"));
  const pageDraft = { images: [{ id: "unsafe", assetPath: "../outside.png" }] };

  assert.equal(writeFinalPageCache({ cacheDir: path.join(root, "cache"), key: "b".repeat(64), pageDraft, irDir: root }), false);
});

test("direct native rebuild CLI exposes safe page cache controls", () => {
  const script = path.join(__dirname, "../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js");
  const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--final-page-cache-dir/);
  assert.match(result.stdout, /--reuse-final-page-cache/);
  assert.match(result.stdout, /--no-final-page-cache/);
  assert.match(result.stdout, /--page-cache-salt/);
});
