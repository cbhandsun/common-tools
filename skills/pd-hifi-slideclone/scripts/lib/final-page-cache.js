"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CACHE_PROVIDER = "slideclone-final-page-cache-v8";
const FINAL_PAGE_RULESET_VERSION = "native-rebuild-rules-2026-07-22-workflow-wms-route-chain-scoped-cache-v18";
const SCOPED_PAGE_ADAPTERS = [
  {
    file: "demand-intake-funnel.js",
    requiredText: ["从杂乱信息到结构化输入", "会议纪要", "业务描述", "竞品截图", "需求理解", "skill"]
  },
  {
    file: "skills-capability-matrix.js",
    requiredText: ["skills能力矩阵", "重塑智能产品工作流", "原始材料", "能力中枢", "prd评审", "原型生成"]
  },
  {
    file: "product-manager-friction-network.js",
    requiredText: ["产品经理日常工作中的高频摩擦", "会议记录", "业务截图", "旧版prd", "口头反馈", "理解偏差", "重复返工", "风险遗漏", "产品交付"]
  },
  {
    file: "fragmented-asset-chain.js",
    requiredText: ["系统爆炸时代", "飞书会议记录", "旧版prd", "口头反馈", "业务截图", "理解偏差", "重复返工", "风险遗漏", "交付看板"]
  },
  {
    file: "visual-operation-sync.js",
    requiredText: ["视觉还原与操作同步", "gem提炼", "形态转换引擎", "可点击交互原型", "自动截屏操作手册", "pmportal", "门户展示"]
  },
  {
    file: "workflow-cover-text.js",
    requiredText: ["ai skills", "核心能力矩阵", "重塑产品交付工作流", "数智赋能"]
  },
  {
    // This adapter is still implemented in the native rebuild composition
    // root. Hash only its self-contained function block so tuning this one
    // diagram does not invalidate unrelated pages.
    file: "workflow-collaboration-multiplier-scope.js",
    requiredText: ["协同倍增器", "下游研发视角", "隐藏红利", "to后端研发", "to前端研发", "to测试"],
    scopedNativeRebuildFunctions: [
      "createWorkflowCollaborationMultiplierObjects",
      "measureWorkflowCollaborationBranches",
      "createWorkflowCollaborationIconCrops",
      "createWorkflowCollaborationMultiplierGraphicCrop",
      "createWorkflowCollaborationCardBackgroundCrop",
      "isWorkflowCollaborationCardChromeShape",
      "markWorkflowCollaborationCardTextAsErasedOverlay",
      "shouldObjectifyWorkflowCollaborationMultiplier",
      "addWorkflowCollaborationTitle",
      "addWorkflowCollaborationHub",
      "addWorkflowCollaborationCards",
      "workflowCollaborationCards",
      "addWorkflowCollaborationBranches",
      "addWorkflowCollaborationBranch",
      "addWorkflowCollaborationBranchGlow",
      "workflowCollaborationMeasuredCurve",
      "workflowCollaborationCurve",
      "workflowCollaborationCurveStyle",
      "addWorkflowCollaborationCard",
      "addWorkflowCollaborationCardIcon",
      "addWorkflowCollaborationBottomBanner"
    ]
  },
  {
    // The WMS route chain is independently tuned around its measured panel
    // and output banner geometry, so preserve unrelated page cache entries.
    file: "workflow-wms-route-chain-scope.js",
    requiredText: ["场景实战ii", "物流wms", "wmsinbound", "tollgate1", "挑战", "ai介入", "价值落地"],
    scopedNativeRebuildFunctions: [
      "createWmsRouteChainShapes",
      "createWmsRouteMinimumUnitCrops",
      "shouldDropWmsRouteChainResidual",
      "shouldObjectifyWmsRouteChain",
      "shouldPreserveWmsRouteCrop",
      "isWmsTopRouteCrop",
      "isWmsValuePanelCrop",
      "inferWmsRouteChainShapes",
      "wmsRouteChainSemanticTextBoxes",
      "inferWmsRouteChainSkeletonShapes",
      "inferWmsTopRouteSkeletonShapes",
      "inferWmsValueCardSkeletonShapes",
      "inferWmsTopRouteShapes",
      "wmsRouteRoadShapes",
      "wmsRouteCalloutTailShapes",
      "wmsRouteDocumentShapes",
      "wmsRouteAiShieldClusterShapes",
      "wmsRouteAiShieldTextBoxes",
      "inferWmsValueCardShapes",
      "wmsRouteChainNativeTextBoxes",
      "wmsRouteChainTextBox",
      "wmsRouteTextMinimumFontSize",
      "wmsRouteChainTextColor",
      "maybeEraseWmsRouteChainText",
      "wmsRouteShapeSource",
      "annotateWmsRouteComponentShapes",
      "wmsRouteComponentRoleForShape",
      "wmsRouteComponentRoleForText",
      "wmsRouteNativeComponentMetadata"
    ]
  },
  {
    // KPI value typography is iterated from measured glyph evidence. Scope the
    // cache to avoid regenerating unrelated diagrams during font fitting.
    file: "workflow-kpi-evidence-scope.js",
    requiredText: ["数据见证", "概念试点", "规模化企业底座", "9大", "15个", "500+份", "400+个"],
    scopedNativeRebuildFunctions: [
      "createWorkflowKpiEvidenceObjects",
      "shouldObjectifyWorkflowKpiEvidence",
      "workflowKpiEvidenceConclusionResidualCrop",
      "workflowKpiEvidenceTextAnchor",
      "workflowKpiEvidenceAnchorY",
      "workflowKpiEvidenceFontSize",
      "addWorkflowKpiEvidenceTitle",
      "addWorkflowKpiEvidenceCards",
      "addWorkflowKpiEvidenceConclusion"
    ]
  }
];
let cachedImplementationFingerprint = "";
const cachedPageImplementationFingerprints = new Map();
const cachedFileContentIdentities = new Map();

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function finalPageCacheOptionsSignature(options = {}) {
  return {
    nativeRebuildRulesetVersion: stringOrEmpty(options.nativeRebuildRulesetVersion) || FINAL_PAGE_RULESET_VERSION,
    implementationFingerprint: stringOrEmpty(options.implementationFingerprint) || finalPageCacheImplementationFingerprint(),
    deckName: stringOrEmpty(options.deckName),
    pageCacheSalt: stringOrEmpty(options.pageCacheSalt),
    preserveGraphics: options.preserveGraphics === true,
    vectorizeStatusIcons: options.vectorizeStatusIcons === true,
    objectifyLayerText: options.objectifyLayerText === true,
    objectifyStructuredVisualAtomText: options.objectifyStructuredVisualAtomText === true,
    objectifyLayerContainers: options.objectifyLayerContainers === true,
    objectifyLayerConnectors: options.objectifyLayerConnectors === true,
    eraseObjectifiedLayerPrimitives: options.eraseObjectifiedLayerPrimitives === true,
    splitErasedResidualCrops: options.splitErasedResidualCrops === true,
    objectifyTableGrid: options.objectifyTableGrid === true,
    objectifyValueBanners: options.objectifyValueBanners === true,
    objectifyToolGapPlatform: options.objectifyToolGapPlatform === true,
    objectifyAssetHubInputIcons: options.objectifyAssetHubInputIcons === true,
    objectifyAssetHubOutputIcons: options.objectifyAssetHubOutputIcons === true,
    objectifySmartReviewSegmented: options.objectifySmartReviewSegmented === true,
    replaceSafeComponentTemplateCrops: options.replaceSafeComponentTemplateCrops === true,
    allowUnverifiedAppliedPluginPrototypeReplay: options.allowUnverifiedAppliedPluginPrototypeReplay === true,
    hybridComponentTemplateResiduals: options.hybridComponentTemplateResiduals === true,
    eraseSpecializedHybridResidualText: options.eraseSpecializedHybridResidualText === true,
    allowAssetOsDemandUnderstandingNativeApproximation: options.allowAssetOsDemandUnderstandingNativeApproximation === true,
    objectifyProductBrainVision: options.objectifyProductBrainVision === true,
    sampleProductBrainVisionColors: options.sampleProductBrainVisionColors === true,
    allowEntropyChallengeNativeApproximation: options.allowEntropyChallengeNativeApproximation === true,
    allowProductCollaborationChallengeNativeApproximation: options.allowProductCollaborationChallengeNativeApproximation === true,
    objectifyComponentGroupMatches: options.objectifyComponentGroupMatches === true,
    componentGroupMatchMinScore: finiteNumberOrNull(options.componentGroupMatchMinScore)
  };
}

function finalPageCacheImplementationFingerprint() {
  if (cachedImplementationFingerprint) return cachedImplementationFingerprint;
  const scriptsDir = path.resolve(__dirname, "..");
  const scopedFiles = new Set(SCOPED_PAGE_ADAPTERS.map((adapter) => path.resolve(__dirname, adapter.file).toLowerCase()));
  const files = [path.join(scriptsDir, "rebuild-real-pptx-native.js"), ...listJavaScriptFiles(__dirname)]
    .filter((file) => !scopedFiles.has(path.resolve(file).toLowerCase()));
  cachedImplementationFingerprint = fingerprintFiles(files, scriptsDir);
  return cachedImplementationFingerprint;
}

function finalPageCachePageImplementationFingerprint(page = {}) {
  const semantic = normalizeSemanticText((page?.textBoxes || []).map((item) => item?.text || "").join(" "));
  const matched = SCOPED_PAGE_ADAPTERS.filter((adapter) =>
    adapter.requiredText.every((token) => semantic.includes(normalizeSemanticText(token)))
  );
  const scopeKey = matched.map((adapter) => adapter.file).sort().join("|") || "shared";
  if (cachedPageImplementationFingerprints.has(scopeKey)) return cachedPageImplementationFingerprints.get(scopeKey);
  const hash = crypto.createHash("sha256");
  const scopedNativeFunctions = matched.flatMap((adapter) => adapter.scopedNativeRebuildFunctions || []);
  hash.update(scopedNativeFunctions.length > 0
    ? finalPageCacheSharedImplementationFingerprint()
    : finalPageCacheImplementationFingerprint());
  hash.update("\0");
  hash.update(fingerprintFiles(matched.map((adapter) => path.resolve(__dirname, adapter.file)), __dirname));
  if (scopedNativeFunctions.length > 0) {
    hash.update("\0");
    hash.update(fingerprintNativeRebuildFunctions(scopedNativeFunctions));
  }
  const fingerprint = hash.digest("hex");
  cachedPageImplementationFingerprints.set(scopeKey, fingerprint);
  return fingerprint;
}

function finalPageCacheSharedImplementationFingerprint() {
  const scriptsDir = path.resolve(__dirname, "..");
  const scopedFiles = new Set(SCOPED_PAGE_ADAPTERS.map((adapter) => path.resolve(__dirname, adapter.file).toLowerCase()));
  const files = listJavaScriptFiles(__dirname)
    .filter((file) => !scopedFiles.has(path.resolve(file).toLowerCase()));
  return fingerprintFiles(files, scriptsDir);
}

function fingerprintNativeRebuildFunctions(functionNames = []) {
  const nativeRebuildFile = path.resolve(__dirname, "..", "rebuild-real-pptx-native.js");
  let source = "";
  try {
    source = fs.readFileSync(nativeRebuildFile, "utf8");
  } catch {
    return "native-rebuild-missing";
  }
  const hash = crypto.createHash("sha256");
  for (const name of [...new Set(functionNames)].sort()) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    const next = start >= 0 ? source.indexOf("\nfunction ", start + marker.length) : -1;
    hash.update(name);
    hash.update("\0");
    hash.update(start >= 0 ? source.slice(start, next >= 0 ? next : source.length) : "missing");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fingerprintFiles(files, rootDir) {
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(rootDir, file).replace(/\\/g, "/"));
    hash.update("\0");
    try {
      // File timestamps can share a filesystem tick during rapid tuning.  A
      // content digest prevents a stale page draft from surviving a rule edit.
      hash.update(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
    } catch {
      hash.update("missing");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listJavaScriptFiles(dir) {
  const files = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(file));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(file);
  }
  return files;
}

function resolveDefaultFinalPageCacheDir(cwd = process.cwd()) {
  return path.resolve(String(cwd || process.cwd()), "runs", "slideclone-final-page-cache");
}

function buildFinalPageCacheKey({ workDir = "", page = {}, pageIndex = 0, slideSize = {}, imageFile = "", options = {} } = {}) {
  const scopedOptions = stringOrEmpty(options.implementationFingerprint)
    ? options
    : { ...options, implementationFingerprint: finalPageCachePageImplementationFingerprint(page) };
  const portablePage = portablePageIdentity(page, workDir, imageFile);
  return sha256(stableJson({
    provider: CACHE_PROVIDER,
    pageIndex: finiteNumberOrNull(pageIndex) ?? 0,
    page: portablePage.page,
    assets: portablePage.assets,
    sourceImage: fileContentIdentity(imageFile),
    slideSize,
    options: finalPageCacheOptionsSignature(scopedOptions)
  }));
}

function portablePageIdentity(page, workDir, imageFile) {
  const assets = [];
  const baseDirs = [...new Set([
    workDir ? path.resolve(String(workDir)) : "",
    imageFile ? path.dirname(path.resolve(String(imageFile))) : ""
  ].filter(Boolean))];
  function visit(value, trail = []) {
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...trail, String(index)]));
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if ((key === "assetPath" || key === "sourceImage") && typeof item === "string" && item) {
        const resolved = resolveExistingContentFile(item, baseDirs);
        const identity = fileContentIdentity(resolved);
        assets.push({ field: [...trail, key].join("."), identity: identity || `missing:${portableMissingPath(item)}` });
        result[key] = "<content-addressed>";
      } else {
        result[key] = visit(item, [...trail, key]);
      }
    }
    return result;
  }
  return { page: visit(page), assets: assets.sort((left, right) => left.field.localeCompare(right.field)) };
}

function resolveExistingContentFile(value, baseDirs) {
  const candidates = path.isAbsolute(value)
    ? [path.normalize(value)]
    : baseDirs.map((baseDir) => path.resolve(baseDir, value));
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || "";
}

function portableMissingPath(value) {
  const normalized = String(value).replace(/\\/g, "/");
  return path.isAbsolute(value) ? path.basename(normalized) : normalized;
}

function fileContentIdentity(file) {
  if (!file) return null;
  try {
    const normalized = path.resolve(String(file));
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) return null;
    const cacheKey = `${normalized}:${stat.size}:${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}`;
    if (cachedFileContentIdentities.has(cacheKey)) return cachedFileContentIdentities.get(cacheKey);
    const identity = { size: stat.size, sha256: crypto.createHash("sha256").update(fs.readFileSync(normalized)).digest("hex") };
    cachedFileContentIdentities.set(cacheKey, identity);
    return identity;
  } catch {
    return null;
  }
}

function normalizeSemanticText(value) {
  return String(value || "").replace(/[\s:：,，。.;；·•—_-]/g, "").toLowerCase();
}

function readFinalPageCache({ cacheDir = "", key = "", irDir = "" } = {}) {
  if (!cacheDir || !validCacheKey(key)) return null;
  const file = finalPageCacheFile(cacheDir, key);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    if (parsed?.provider !== CACHE_PROVIDER || parsed?.key !== key || !parsed.pageDraft || !Array.isArray(parsed.assets)) return null;
    if (!restoreCachedAssets({ cacheDir, key, pageDraft: parsed.pageDraft, assetManifest: parsed.assets, irDir })) return null;
    return parsed.pageDraft;
  } catch {
    return null;
  }
}

function writeFinalPageCache({ cacheDir = "", key = "", pageDraft = null, irDir = "" } = {}) {
  if (!cacheDir || !validCacheKey(key) || !pageDraft || typeof pageDraft !== "object") return false;
  fs.mkdirSync(cacheDir, { recursive: true });
  const assets = cachePageAssets({ cacheDir, key, pageDraft, irDir });
  if (!assets) return false;
  const cacheFile = finalPageCacheFile(cacheDir, key);
  const temporaryFile = `${cacheFile}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify({
    provider: CACHE_PROVIDER,
    key,
    writtenAt: new Date().toISOString(),
    assets,
    pageDraft
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    fs.renameSync(temporaryFile, cacheFile);
  } catch (error) {
    try { fs.rmSync(temporaryFile, { force: true }); } catch { /* best-effort cleanup */ }
    if (error?.code !== "EEXIST") throw error;
  }
  return true;
}

function cachePageAssets({ cacheDir, key, pageDraft, irDir }) {
  const relativeAssets = pageRelativeAssetPaths(pageDraft);
  if (relativeAssets.length === 0) return [];
  if (!irDir) return null;
  const manifest = [];
  for (const relativeAsset of relativeAssets) {
    const source = safeRelativeFile(irDir, relativeAsset);
    const target = safeRelativeFile(finalPageCacheAssetDir(cacheDir, key), relativeAsset);
    if (!source || !target || !fs.existsSync(source)) return null;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    const identity = fileContentIdentity(source);
    if (!identity) return null;
    manifest.push({ path: relativeAsset, ...identity });
  }
  return manifest;
}

function restoreCachedAssets({ cacheDir, key, pageDraft, assetManifest, irDir }) {
  const relativeAssets = pageRelativeAssetPaths(pageDraft);
  if (relativeAssets.length === 0) return true;
  if (!irDir) return false;
  const manifest = new Map(assetManifest.map((item) => [item?.path, item]));
  for (const relativeAsset of relativeAssets) {
    const source = safeRelativeFile(finalPageCacheAssetDir(cacheDir, key), relativeAsset);
    const target = safeRelativeFile(irDir, relativeAsset);
    if (!source || !target || !fs.existsSync(source)) return false;
    const expected = manifest.get(relativeAsset);
    const actual = fileContentIdentity(source);
    if (!expected || !actual || expected.size !== actual.size || expected.sha256 !== actual.sha256) return false;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return true;
}

function pageRelativeAssetPaths(pageDraft) {
  const result = new Set();
  for (const image of pageDraft?.images || []) {
    const assetPath = stringOrEmpty(image?.assetPath).replace(/\\/g, "/");
    if (assetPath && !path.isAbsolute(assetPath)) result.add(assetPath);
  }
  return [...result].sort();
}

function finalPageCacheAssetDir(cacheDir, key) {
  return path.join(path.resolve(String(cacheDir)), `${key}.assets`);
}

function safeRelativeFile(root, relativeFile) {
  if (!root || !relativeFile || path.isAbsolute(relativeFile)) return "";
  const resolvedRoot = path.resolve(String(root));
  const resolvedFile = path.resolve(resolvedRoot, String(relativeFile));
  const prefix = `${resolvedRoot}${path.sep}`.toLowerCase();
  return resolvedFile.toLowerCase().startsWith(prefix) ? resolvedFile : "";
}

function finalPageCacheFile(cacheDir, key) {
  return path.join(path.resolve(String(cacheDir)), `${key}.json`);
}

function validCacheKey(key) {
  return typeof key === "string" && /^[a-f0-9]{64}$/.test(key);
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

module.exports = {
  CACHE_PROVIDER,
  FINAL_PAGE_RULESET_VERSION,
  buildFinalPageCacheKey,
  finalPageCacheImplementationFingerprint,
  finalPageCachePageImplementationFingerprint,
  finalPageCacheOptionsSignature,
  fingerprintFiles,
  fileContentIdentity,
  portablePageIdentity,
  readFinalPageCache,
  resolveDefaultFinalPageCacheDir,
  stableJson,
  writeFinalPageCache
};
