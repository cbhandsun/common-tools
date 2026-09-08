"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { searchOfficePlusComponents } = require("./officeplus-search");
const { searchIslideContents } = require("./islide-search");
const { maintainHashedCache } = require("./cache-budget");
const QUERY_CACHE_VERSION = 2;
const QUERY_IMPLEMENTATION = crypto.createHash("sha256")
  .update(fs.readFileSync(require.resolve("./officeplus-search")))
  .update(fs.readFileSync(require.resolve("./islide-search")))
  .digest("hex");

function buildComponentSearchPlan(diagramUnderstanding = {}, context = {}) {
  const strategy = diagramUnderstanding.componentStrategy || {};
  const archetype = String(diagramUnderstanding.archetype || "");
  const nodeTexts = (diagramUnderstanding.nodes || [])
    .map((node) => node?.text)
    .filter(Boolean);
  const family = normalizeTemplateFamily(strategy.templateFamily, archetype, {
    ...context,
    textBoxes: [
      ...(Array.isArray(context.textBoxes) ? context.textBoxes : []),
      ...nodeTexts.map((text) => ({ text }))
    ]
  });
  const text = collectContextText(context);
  const targetMotifs = normalizeTargetMotifs([
    ...(Array.isArray(diagramUnderstanding.targetMotifs) ? diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : [])
  ]);
  const structureSignature = normalizeStructureSignature(diagramUnderstanding.structureSignature || strategy.structureSignature);
  const baseKeywords = keywordHintsFor({ family, archetype, strategy, text, nodeTexts, targetMotifs, structureSignature });
  const queries = querySpecsForWithKeywords({ family, archetype, strategy }, baseKeywords)
    .map((spec, index) => ({
      id: `component-query-${index + 1}`,
      provider: spec.provider,
      kind: spec.kind,
      keywords: spec.keyword,
      size: clampInteger(context.size, 1, 20, 6),
      rationale: rationaleFor({ provider: spec.provider, kind: spec.kind, family, strategy })
    }));
  return {
    provider: "component-candidate-planner-v1",
    mode: strategy.mode || "preserve-or-hybrid",
    templateFamily: family,
    ...(targetMotifs.length ? { targetMotifs } : {}),
    ...(structureSignature ? { structureSignature } : {}),
    sourcePreference: mergeSourcePreference(strategy.sourcePreference),
    queries
  };
}

function buildLegacyLayerComponentSeed(layer = {}, image = {}, page = {}) {
  const detector = String(layer.detector || image.source?.detector || "");
  const reason = String(image.source?.reason || image.source?.nonEditableReason || layer.explanation || "");
  const layerType = String(layer.layerType || "");
  const text = `${detector} ${reason} ${layerType}`.toLowerCase();
  const pageText = (page.textBoxes || []).map((item) => item?.text).filter(Boolean).join(" ");
  if (/timeline|milestone|时间轴|里程碑/.test(text)) {
    return seed("timeline", "generic-node-diagram", "时间轴", "component-template");
  }
  if (/cycle|circular|loop|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形|旋转箭头/.test(text)) {
    return seed("cycle-loop", "cycle-loop", pageText || "循环箭头", "component-template");
  }
  if (/hub|spoke|关系|中心|辐射/.test(text)) {
    return seed("hub-spoke", "hub-spoke", "关系图", "hybrid-template-plus-local-crops");
  }
  if (/flow|chain|process|流程|步骤|demand|prototype|workflow/.test(text)) {
    return seed("process-chain", "flow-card-chain", "流程", "component-template");
  }
  if (/matrix|grid|table|矩阵|表格/.test(text)) {
    return seed("grid-or-matrix", "matrix-or-grid", "矩阵", "component-template");
  }
  if (/diagram-zone/.test(layerType) && /foreground|graphic|underlay|crop/.test(text)) {
    return seed("hub-spoke", "hub-spoke", pageText || "关系图", "hybrid-template-plus-local-crops");
  }
  if (/illustration|icon|entropy|graphic|underlay|crop|插图|图标/.test(text) || /illustration-zone/.test(layerType)) {
    return seed("icon-or-illustration", "unclassified-diagram", pageText || "插图", "hybrid-template-plus-local-crops");
  }
  return seed("generic", "unclassified-diagram", pageText || "关系图", "preserve-or-hybrid");
}

async function searchComponentCandidates(diagramUnderstanding = {}, context = {}) {
  const plan = buildComponentSearchPlan(diagramUnderstanding, context);
  const fetchImpl = context.fetchImpl;
  const signal = context.signal;
  const queryMemo = context.queryMemo instanceof Map ? context.queryMemo : new Map();
  const concurrency = normalizeQueryConcurrency(context.queryConcurrency);
  const results = await mapLimited(plan.queries, concurrency, async (query) => {
    try {
      const result = await runMemoizedComponentQuery(query, { fetchImpl, signal, context, queryMemo });
      return {
        query,
        status: "ok",
        total: result.total,
        documents: result.documents.map((document) => scoreCandidateDocument(document, diagramUnderstanding, query))
      };
    } catch (error) {
      return {
        query,
        status: "error",
        error: safeErrorMessage(error)
      };
    }
  });
  return {
    provider: "component-candidate-search-v1",
    plan,
    results
  };
}

function runMemoizedComponentQuery(query, { fetchImpl, signal, context, queryMemo }) {
  const identity = componentQueryIdentity(query, context);
  if (queryMemo.has(identity.key)) return queryMemo.get(identity.key);
  const promise = Promise.resolve().then(() => {
    const cached = readComponentQueryCache(context.queryCacheDir, identity, context.queryCacheTtlMs);
    if (cached) return cached;
    return runComponentQuery(query, { fetchImpl, signal, context }).then((result) => {
      try { writeComponentQueryCache(context.queryCacheDir, identity, result); } catch {}
      return result;
    });
  });
  queryMemo.set(identity.key, promise);
  return promise;
}

function componentQueryIdentity(query = {}, context = {}) {
  const payload = {
    provider: String(query.provider || ""),
    kind: String(query.kind || ""),
    keywords: String(query.keywords || ""),
    size: Number(query.size || 0),
    baseUrl: String(query.provider === "islide" ? context.islideBaseUrl || "" : context.officePlusBaseUrl || ""),
    version: QUERY_CACHE_VERSION,
    implementation: QUERY_IMPLEMENTATION
  };
  return {
    payload,
    key: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  };
}

function readComponentQueryCache(cacheDir, identity, ttlValue) {
  if (!cacheDir) return null;
  const ttlMs = normalizeQueryCacheTtl(ttlValue);
  const file = componentQueryCacheFile(cacheDir, identity.key);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < 2 || stat.size > 8 * 1024 * 1024 || Date.now() - stat.mtimeMs > ttlMs) return null;
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    if (payload?.version !== QUERY_CACHE_VERSION || payload?.key !== identity.key || JSON.stringify(payload.identity) !== JSON.stringify(identity.payload)) return null;
    return normalizeCachedQueryResult(payload.result);
  } catch {
    return null;
  }
}

function writeComponentQueryCache(cacheDir, identity, result) {
  if (!cacheDir) return;
  const normalized = normalizeCachedQueryResult(result);
  if (!normalized) return;
  const dir = path.resolve(String(cacheDir));
  fs.mkdirSync(dir, { recursive: true });
  const file = componentQueryCacheFile(dir, identity.key);
  const body = `${JSON.stringify({ version: QUERY_CACHE_VERSION, key: identity.key, identity: identity.payload, result: normalized })}\n`;
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) return;
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(5).toString("hex")}`;
  try {
    fs.writeFileSync(temporary, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    fs.renameSync(temporary, file);
    maintainHashedCache({ root: dir, maxBytes: 512 * 1024 * 1024, layout: "flat" });
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function componentQueryCacheFile(cacheDir, key) {
  if (!/^[a-f0-9]{64}$/.test(String(key))) throw new Error("component query cache key is invalid");
  return path.join(path.resolve(String(cacheDir)), `${key}.json`);
}

function normalizeCachedQueryResult(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.documents)) return null;
  if (result.documents.length > 1000) return null;
  const total = Number(result.total);
  if (!Number.isFinite(total) || total < 0 || total > 10_000_000) return null;
  return { total, documents: result.documents };
}

function normalizeQueryConcurrency(value) {
  if (value === undefined || value === null || value === "") return 3;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 8) throw new RangeError("component query concurrency must be an integer from 1 to 8");
  return number;
}

function normalizeQueryCacheTtl(value) {
  if (value === undefined || value === null || value === "") return 24 * 60 * 60 * 1000;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 60_000 || number > 30 * 24 * 60 * 60 * 1000) {
    throw new RangeError("component query cache TTL must be between one minute and 30 days");
  }
  return Math.floor(number);
}

async function mapLimited(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return results;
}

function scoreCandidateDocument(document = {}, diagramUnderstanding = {}, query = {}) {
  const family = String(diagramUnderstanding.componentStrategy?.templateFamily || diagramUnderstanding.archetype || "");
  const targetMotifs = normalizeTargetMotifs([
    ...(Array.isArray(diagramUnderstanding.targetMotifs) ? diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(diagramUnderstanding.componentStrategy?.targetMotifs) ? diagramUnderstanding.componentStrategy.targetMotifs : [])
  ]);
  const structureSignature = normalizeStructureSignature(
    diagramUnderstanding.structureSignature || diagramUnderstanding.componentStrategy?.structureSignature
  );
  const haystack = `${document.title || ""} ${document.description || ""} ${(document.tags || []).join(" ")}`.toLowerCase();
  const sourceProvider = query.provider || "officeplus";
  let score = Number(document.score || 0);
  for (const token of familyTokens(family)) {
    if (token && haystack.includes(token.toLowerCase())) score += 12;
  }
  for (const token of targetMotifTokens(targetMotifs)) {
    if (token && haystack.includes(token.toLowerCase())) score += 14;
  }
  if (sourceProvider === "officeplus" && query.kind === "component" && document.reuseHint === "candidate-grouped-pptx-component") score += 40;
  if (sourceProvider === "islide" && query.kind === "diagram" && document.reuseHint === "candidate-polished-diagram-reference") score += 28;
  if (sourceProvider === "islide" && query.kind === "smartdiagram") score += 32;
  if (query.kind === "vector" && document.reuseHint === "candidate-vector-or-icon-match") score += 10;
  score += scoreStructureCountFit(haystack, structureSignature);
  if (document.coverUrl) score += 4;
  if ((document.attachments || []).length) score += 2;
  return {
    ...document,
    sourceProvider,
    candidateScore: round(score)
  };
}

function scoreStructureCountFit(text = "", structureSignature = null) {
  const expected = Number(structureSignature?.stepCount || 0);
  if (!Number.isFinite(expected) || expected < 3 || expected > 12) return 0;
  const actual = itemCountFromText(text);
  if (!actual) return 0;
  if (actual === expected) return 18;
  const delta = Math.abs(actual - expected);
  if (delta === 1) return -8;
  return -16;
}

function itemCountFromText(text = "") {
  const value = String(text || "").toLowerCase();
  const rowColumn = value.match(/(?:^|[^0-9])([2-6])\s*(?:行|row|rows)\s*(?:[x×*]\s*)?([2-6])\s*(?:列|column|columns|col|cols)(?:[^0-9]|$)/i)
    || value.match(/(?:^|[^0-9])([2-6])\s*[x×*]\s*([2-6])\s*(?:矩阵|宫格|网格|卡片|grid|matrix|cards?)(?:[^0-9]|$)/i);
  if (rowColumn) return Number(rowColumn[1]) * Number(rowColumn[2]);
  const digit = value.match(/(?:^|[^0-9])([2-9]|1[0-2])\s*(?:项|步|个|段|端|节点|分支|格|宫格|卡片|层|级|阶|集合|圆|圈|柱|根|条|组|系列|点|数据点|扇区|里程碑|阶段|节点位|step|steps|stage|stages|milestone|milestones|cell|cells|card|cards|layer|layers|tier|tiers|set|sets|circle|circles|bar|bars|column|columns|series|point|points|segment|segments)(?:[^0-9]|$)/i);
  if (digit) return Number(digit[1]);
  const zhMap = {
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    十一: 11,
    十二: 12
  };
  const zh = value.match(/(十二|十一|十|九|八|七|六|五|四|三|二)\s*(?:项|步|个|段|端|节点|分支|格|宫格|卡片|层|级|阶|集合|圆|圈|柱|根|条|组|系列|点|数据点|扇区|里程碑|阶段|节点位)/);
  return zh ? zhMap[zh[1]] || 0 : 0;
}

function seed(templateFamily, archetype, keyword, mode) {
  return {
    provider: "legacy-layer-component-seed-v1",
    archetype,
    confidence: 0.45,
    nativeReadiness: mode === "component-template" ? "hybrid-native-plus-residual-crops" : "preserve-crop-with-structured-metadata",
    componentStrategy: {
      provider: "component-strategy-v1",
      mode,
      templateFamily,
    sourcePreference: ["officeplus-search", "islide-search"],
      reason: "legacy layer metadata mapped to plugin component search seed"
    },
    nodes: keyword ? [{ id: "legacy-keyword", text: keyword }] : []
  };
}

async function runComponentQuery(query, { fetchImpl, signal, context }) {
  if (query.provider === "islide") {
    return searchIslideContents({
      kind: query.kind,
      keywords: query.keywords,
      size: query.size,
      fetchImpl,
      signal,
      baseUrl: context.islideBaseUrl
    });
  }
  return searchOfficePlusComponents({
    kind: query.kind,
    keywords: query.keywords,
    size: query.size,
    fetchImpl,
    signal,
    deviceId: context.deviceId,
    baseUrl: context.officePlusBaseUrl
  });
}

function querySpecsFor({ family, archetype, strategy }) {
  const officePlusKinds = queryKindsFor({ family, archetype, strategy });
  const islideKinds = islideKindsFor({ family, archetype, strategy });
  return [
    ...officePlusKinds.map((kind) => ({ provider: "officeplus", kind })),
    ...islideKinds.map((kind) => ({ provider: "islide", kind }))
  ];
}

function querySpecsForWithKeywords(args, keywords = []) {
  const baseSpecs = querySpecsFor(args);
  const compactKeywords = compact(keywords);
  const fallbackKeyword = compactKeywords[0] || args.family || args.archetype || "关系图";
  const seeded = baseSpecs.map((spec, index) => ({
    ...spec,
    keyword: compactKeywords[index] || fallbackKeyword
  }));
  const used = new Set(seeded.map((spec) => `${spec.provider}:${spec.kind}:${spec.keyword}`));
  const extras = [];
  for (let index = baseSpecs.length; index < compactKeywords.length; index += 1) {
    const baseSpec = baseSpecs[index % Math.max(1, baseSpecs.length)] || { provider: "officeplus", kind: "component" };
    const spec = { ...baseSpec, keyword: compactKeywords[index] };
    const key = `${spec.provider}:${spec.kind}:${spec.keyword}`;
    if (used.has(key)) continue;
    used.add(key);
    extras.push(spec);
  }
  return [...seeded, ...extras];
}

function queryKindsFor({ family, archetype, strategy }) {
  const mode = String(strategy.mode || "");
  if (family === "cycle-loop" || /cycle|loop|闭环|循环|环形/.test(archetype)) return ["component", "shape", "vector"];
  if (family === "funnel-lens-flow") return ["component", "shape", "vector", "ppt"];
  if (family === "fishbone-cause-effect") return ["component", "shape", "ppt"];
  if (family === "treemap-chart") return ["component", "shape", "ppt"];
  if (family === "sankey-flow-chart") return ["component", "ppt"];
  if (family === "map-chart") return ["component", "shape", "ppt"];
  if (family === "word-cloud-chart") return ["component", "shape", "ppt"];
  if (family === "waterfall-chart") return ["component", "ppt"];
  if (family === "gauge-chart") return ["component", "shape", "ppt"];
  if (family === "radar-chart") return ["component", "ppt"];
  if (family === "swimlane-flow") return ["component", "shape", "ppt"];
  if (family === "topology-diagram") return ["component", "shape", "vector", "ppt"];
  if (family === "process-chain" || archetype === "flow-card-chain") return ["component", "shape", "vector"];
  if (family === "timeline" || /timeline|roadmap|milestone/.test(archetype)) return ["component", "shape", "vector", "ppt"];
  if (family === "hierarchy-tree") return ["component", "shape", "ppt"];
  if (family === "hub-spoke") return ["component", "icon", "vector"];
  if (family === "screenshot-card-grid") return ["component", "shape", "ppt"];
  if (family === "visual-example-card-grid") return ["component", "shape", "ppt"];
  if (family === "feature-icon-card-grid") return ["component", "shape", "icon", "vector", "ppt"];
  if (family === "numbered-step-card-grid") return ["component", "shape", "vector", "ppt"];
  if (family === "screenshot-zoom-callout") return ["component", "shape", "vector", "ppt"];
  if (family === "screenshot-annotation") return ["component", "shape", "vector", "ppt"];
  if (family === "concentric-circles") return ["component", "shape", "ppt"];
  if (family === "quadrant-matrix") return ["component", "shape", "ppt"];
  if (family === "grid-or-matrix") return ["component", "shape"];
  if (family === "layered-stack") return ["component", "shape", "ppt"];
  if (family === "venn-overlap") return ["component", "shape", "ppt"];
  if (/chart/.test(family) || /chart/.test(archetype)) return ["component", "ppt"];
  if (family === "icon-or-illustration" || /icon|illustration/.test(mode)) return ["icon", "vector"];
  return ["component"];
}

function islideKindsFor({ family, archetype, strategy }) {
  const mode = String(strategy.mode || "");
  if (family === "cycle-loop" || /cycle|loop|闭环|循环|环形/.test(archetype)) return ["diagram", "smartdiagram", "vector"];
  if (family === "funnel-lens-flow") return ["diagram", "smartdiagram", "template", "vector"];
  if (family === "fishbone-cause-effect") return ["diagram", "smartdiagram", "template"];
  if (family === "treemap-chart") return ["diagram", "smartdiagram", "template"];
  if (family === "sankey-flow-chart") return ["diagram", "smartdiagram", "template"];
  if (family === "map-chart") return ["diagram", "smartdiagram", "template"];
  if (family === "word-cloud-chart") return ["diagram", "smartdiagram", "template"];
  if (family === "waterfall-chart") return ["smartdiagram", "template"];
  if (family === "gauge-chart") return ["diagram", "smartdiagram", "template"];
  if (family === "radar-chart") return ["smartdiagram", "template"];
  if (family === "swimlane-flow") return ["diagram", "smartdiagram", "template"];
  if (family === "topology-diagram") return ["diagram", "smartdiagram", "template", "vector"];
  if (family === "process-chain" || archetype === "flow-card-chain") return ["diagram", "smartdiagram"];
  if (family === "timeline" || /timeline|roadmap|milestone/.test(archetype)) return ["diagram", "smartdiagram", "template"];
  if (family === "hierarchy-tree") return ["diagram", "smartdiagram", "template"];
  if (family === "hub-spoke") return ["diagram", "smartdiagram", "icon", "vector"];
  if (family === "screenshot-card-grid") return ["diagram", "smartdiagram", "template"];
  if (family === "visual-example-card-grid") return ["diagram", "smartdiagram", "template"];
  if (family === "feature-icon-card-grid") return ["diagram", "smartdiagram", "template", "icon", "vector"];
  if (family === "numbered-step-card-grid") return ["diagram", "smartdiagram", "template", "vector"];
  if (family === "screenshot-zoom-callout") return ["diagram", "smartdiagram", "template", "vector"];
  if (family === "screenshot-annotation") return ["diagram", "smartdiagram", "template", "vector"];
  if (family === "concentric-circles") return ["diagram", "smartdiagram", "template"];
  if (family === "quadrant-matrix") return ["diagram", "smartdiagram", "template"];
  if (family === "grid-or-matrix") return ["diagram", "smartdiagram"];
  if (family === "layered-stack") return ["diagram", "smartdiagram", "template"];
  if (family === "venn-overlap") return ["diagram", "smartdiagram", "template"];
  if (/chart/.test(family) || /chart/.test(archetype)) return ["smartdiagram", "template"];
  if (family === "icon-or-illustration" || /icon|illustration/.test(mode)) return ["icon", "vector"];
  return ["diagram"];
}

function keywordHintsFor({ family, archetype, text, nodeTexts, targetMotifs = [], structureSignature = null }) {
  const joinedNodes = nodeTexts.join(" ");
  const motifKeywords = targetMotifKeywords(targetMotifs);
  const structureKeywords = structureSignatureKeywords(structureSignature);
  if (family === "cycle-loop" || /cycle|loop|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形/.test(archetype) || /闭环|循环|环形|双环|圆弧|弧形|旋转箭头|DOM\s*语义|交互原型/.test(`${joinedNodes} ${text}`)) {
    return compact([...structureKeywords, ...motifKeywords, "闭环流程", "循环流程", "环形箭头", "圆弧箭头", "双环流程", joinedNodes || text]);
  }
  if (family === "funnel-lens-flow") return compact([...structureKeywords, ...motifKeywords, "放大镜流程", "漏斗流程", "收敛流程", "需求分析", "聚焦分析", "magnifier funnel", joinedNodes || text]);
  if (family === "fishbone-cause-effect") return compact([...structureKeywords, ...motifKeywords, "鱼骨图", "因果分析", "根因分析", "Ishikawa", "6M分析", "cause effect diagram", joinedNodes || text]);
  if (family === "treemap-chart") return compact([...structureKeywords, ...motifKeywords, "矩形树图", "面积占比图", "构成分布图", "份额构成图", "treemap", joinedNodes || text]);
  if (family === "sankey-flow-chart") return compact([...structureKeywords, ...motifKeywords, "桑基图", "流向图", "流量分布", "流转分布", "能量流", "sankey diagram", "alluvial diagram", joinedNodes || text]);
  if (family === "map-chart") return compact([...structureKeywords, ...motifKeywords, "地图图表", "中国地图", "区域地图", "地理分布", "地图热力", "choropleth map", "geo map", joinedNodes || text]);
  if (family === "word-cloud-chart") return compact([...structureKeywords, ...motifKeywords, "词云组件", "关键词云", "标签云", "文字云", "热词云", "word cloud", "tag cloud", joinedNodes || text]);
  if (family === "waterfall-chart") return compact([...structureKeywords, ...motifKeywords, "瀑布图", "增减分析", "差异桥图", "waterfall chart", "variance bridge", joinedNodes || text]);
  if (family === "gauge-chart") return compact([...structureKeywords, ...motifKeywords, "仪表图", "仪表盘图", "速度表", "半圆仪表", "进度仪表", "gauge chart", "speedometer", joinedNodes || text]);
  if (family === "radar-chart") return compact([...structureKeywords, ...motifKeywords, "雷达图", "蛛网图", "能力雷达", "维度评分", "radar chart", "spider chart", joinedNodes || text]);
  if (family === "swimlane-flow") return compact([...structureKeywords, ...motifKeywords, "泳道流程", "跨部门流程", "泳道图", "分栏流程", "多角色流程", "swimlane process", "cross functional flowchart", joinedNodes || text]);
  if (family === "topology-diagram") return compact([...structureKeywords, ...motifKeywords, "拓扑关系图", "铁三角关系", "三角关系图", "闭环关系图", "三元关系", "triangle topology", "relationship triangle", joinedNodes || text]);
  if (family === "process-chain" || archetype === "flow-card-chain") return compact([...structureKeywords, ...motifKeywords, "流程", "步骤流程", joinedNodes || text]);
  if (family === "timeline" || /timeline|roadmap|milestone|gantt/.test(archetype)) return compact([...structureKeywords, ...motifKeywords, "时间轴", "里程碑", "路线图", "项目排期", "甘特图", "roadmap", "gantt chart", joinedNodes || text]);
  if (family === "hierarchy-tree") return compact([...structureKeywords, ...motifKeywords, "组织架构", "层级结构", "树状图", "层级关系图", "上下级关系", "组织结构图", "hierarchy chart", "org chart", joinedNodes || text]);
  if (family === "hub-spoke") return compact([...structureKeywords, ...motifKeywords, "关系图", "中心辐射", "放射关系图", "径向关系", "组织架构", "层级关系图", joinedNodes || text]);
  if (family === "screenshot-card-grid") return compact([...structureKeywords, ...motifKeywords, "产品截图展示", "界面展示", "截图卡片", "截图宫格", "多屏展示", "mockup cards", "screen gallery", "ui showcase", joinedNodes || text]);
  if (family === "visual-example-card-grid") return compact([...structureKeywords, ...motifKeywords, "图示样例卡片", "组件预览卡片", "素材预览卡片", "示例图示卡片", "图形示例展示", "diagram sample cards", "component preview cards", "visual example cards", joinedNodes || text]);
  if (family === "feature-icon-card-grid") return compact([...structureKeywords, ...motifKeywords, "功能卡片", "图标卡片", "特性卡片", "能力卡片", "功能宫格", "feature cards", "icon cards", "capability cards", joinedNodes || text]);
  if (family === "numbered-step-card-grid") return compact([...structureKeywords, ...motifKeywords, "步骤卡片", "编号流程", "序号卡片", "阶段卡片", "流程卡片", "分步说明", "step cards", "numbered process cards", "sequence cards", joinedNodes || text]);
  if (family === "screenshot-zoom-callout") return compact([...structureKeywords, ...motifKeywords, "局部放大", "放大镜标注", "放大框", "截图局部放大", "细节放大", "zoom callout", "magnifier callout", joinedNodes || text]);
  if (family === "screenshot-annotation") return compact([...structureKeywords, ...motifKeywords, "截图标注", "界面标注", "说明气泡", "标注框", "高亮框", "放大镜标注", "callout annotation", "screenshot callout", joinedNodes || text]);
  if (family === "concentric-circles") return compact([...structureKeywords, ...motifKeywords, "同心圆", "洋葱图", "圈层模型", "层级圆", "concentric circles", "onion diagram", joinedNodes || text]);
  if (family === "quadrant-matrix") return compact([...structureKeywords, ...motifKeywords, "四象限", "象限图", "优先级矩阵", "影响成本矩阵", "价值难度矩阵", "impact effort matrix", joinedNodes || text]);
  if (family === "grid-or-matrix") return compact([...structureKeywords, ...motifKeywords, "矩阵", "四象限", "对比矩阵", "方案对比", "热力图", "风险矩阵", joinedNodes || text]);
  if (family === "layered-stack") return compact([...structureKeywords, ...motifKeywords, "金字塔", "分层图", "漏斗图", "阶梯图", joinedNodes || text]);
  if (family === "venn-overlap") return compact([...structureKeywords, ...motifKeywords, "Venn图", "集合关系", "交集关系图", "重叠关系", joinedNodes || text]);
  if (/bar-chart/.test(family)) return compact([...structureKeywords, "柱状图", "条形图", "柱状图模板", "数据图表", joinedNodes || text]);
  if (/line-chart/.test(family)) return compact([...structureKeywords, "折线图", "趋势图", "走势图", "折线图模板", joinedNodes || text]);
  if (/scatter-chart/.test(family)) return compact([...structureKeywords, ...motifKeywords, "散点图", "气泡图", "气泡矩阵", "组合分布图", "定位图", "散点图模板", joinedNodes || text]);
  if (/pie-chart/.test(family)) return compact([...structureKeywords, ...motifKeywords, "饼图", "扇区占比图", "份额图", "比例图", "pie chart template", joinedNodes || text]);
  if (/donut-chart/.test(family)) return compact([...structureKeywords, "环形图", "占比图", "饼图", "环形占比图", joinedNodes || text]);
  if (family === "icon-or-illustration") return compact([text || "图标", "插图"]);
  return compact([...structureKeywords, ...motifKeywords, text, family, archetype, "关系图"]);
}

function targetMotifKeywords(targetMotifs = []) {
  const keywords = [];
  for (const motif of normalizeTargetMotifs(targetMotifs)) {
    if (motif === "cycle-loop") keywords.push("循环流程", "闭环流程", "循环箭头组件", "环形箭头组件", "旋转箭头");
    else if (motif === "arc-arrow") keywords.push("圆弧箭头", "环形箭头", "循环箭头", "弧形箭头", "旋转箭头");
    else if (motif === "ring-node") keywords.push("环形节点", "圆环节点");
    else if (motif === "card-grid") keywords.push("卡片矩阵", "矩阵卡片", "宫格卡片");
    else if (motif === "dashboard-card-grid") keywords.push("数据看板", "KPI卡片", "指标卡片", "仪表盘卡片", "dashboard cards", "kpi dashboard");
    else if (motif === "comparison-matrix") keywords.push("对比矩阵", "方案对比", "竞品对比", "优劣对比", "优缺点对比", "before after comparison", "comparison table");
    else if (motif === "heatmap-matrix") keywords.push("热力图", "热力矩阵", "风险矩阵", "色阶矩阵", "色块矩阵", "heatmap", "risk matrix");
    else if (motif === "treemap-chart") keywords.push("矩形树图", "面积占比图", "构成分布图", "份额构成图", "市场份额图", "treemap", "area composition");
    else if (motif === "sankey-flow-chart") keywords.push("桑基图", "流向图", "流量分布图", "流转分布图", "能量流图", "sankey diagram", "alluvial diagram", "flow distribution");
    else if (motif === "map-chart") keywords.push("地图图表", "中国地图", "区域地图", "地理分布图", "地图热力图", "choropleth map", "geo map");
    else if (motif === "word-cloud-chart") keywords.push("词云", "词云组件", "关键词云", "标签云", "文字云", "热词云", "word cloud", "tag cloud");
    else if (motif === "waterfall-chart") keywords.push("瀑布图", "增减分析图", "差异桥图", "waterfall chart", "variance bridge");
    else if (motif === "gauge-chart") keywords.push("仪表图", "仪表盘图", "速度表", "半圆仪表", "进度仪表", "gauge chart", "speedometer");
    else if (motif === "radar-chart") keywords.push("雷达图", "蛛网图", "蜘蛛网图", "能力雷达", "维度评分", "radar chart", "spider chart");
    else if (motif === "tree-link") keywords.push("树状层级", "组织结构图", "层级关系图");
    else if (motif === "org-hierarchy") keywords.push("组织架构", "组织结构图", "部门架构", "岗位层级", "汇报关系图", "上下级关系图", "org chart", "organization chart");
    else if (motif === "fishbone-cause") keywords.push("鱼骨图", "因果分析", "根因分析", "Ishikawa", "cause effect diagram");
    else if (motif === "radial-link") keywords.push("中心辐射", "放射关系图", "径向关系");
    else if (motif === "screenshot-card-grid") keywords.push("产品截图展示", "界面展示", "截图卡片", "截图宫格", "多屏展示", "mockup cards", "screen gallery", "ui showcase");
    else if (motif === "screenshot-crop") keywords.push("截图占位", "产品截图", "界面截图", "screen placeholder", "mockup placeholder");
    else if (motif === "visual-example-card-grid") keywords.push("图示样例卡片", "组件预览卡片", "素材预览卡片", "示例图示卡片", "图形示例展示", "diagram sample cards", "component preview cards", "visual example cards");
    else if (motif === "visual-example-crop") keywords.push("图示样例", "组件预览", "插件预览", "素材预览", "示例图示", "diagram sample", "component preview");
    else if (motif === "feature-icon-card-grid") keywords.push("功能卡片", "图标卡片", "特性卡片", "能力卡片", "亮点卡片", "feature cards", "icon cards", "capability cards");
    else if (motif === "icon-crop") keywords.push("图标组件", "线性图标", "扁平图标", "icon set", "pictogram");
    else if (motif === "numbered-step-card-grid") keywords.push("步骤卡片", "编号流程", "序号卡片", "阶段卡片", "流程卡片", "step cards", "numbered process cards", "sequence cards");
    else if (motif === "step-badge") keywords.push("编号圆点", "步骤编号", "序号圆点", "数字角标", "number badge", "step badge");
    else if (motif === "screenshot-zoom-callout") keywords.push("局部放大", "放大镜标注", "截图局部放大", "细节放大", "zoom callout", "magnifier callout");
    else if (motif === "zoom-lens-overlay") keywords.push("放大镜", "放大框", "局部放大框", "zoom lens", "magnifier lens", "loupe");
    else if (motif === "screenshot-annotation") keywords.push("截图标注", "界面标注", "页面标注", "截图说明", "screenshot annotation", "annotated screenshot");
    else if (motif === "callout-overlay") keywords.push("说明气泡", "标注气泡", "注释框", "callout", "annotation bubble", "label callout");
    else if (motif === "highlight-box") keywords.push("高亮框", "框选", "圈选", "重点标记", "highlight box", "spotlight");
    else if (motif === "concentric-circles") keywords.push("同心圆", "洋葱图", "圈层模型", "层级圆", "嵌套圆", "concentric circles", "onion diagram");
    else if (motif === "linear-arrow-chain") keywords.push("箭头流程", "步骤箭头", "流程箭头", "时间轴", "路线图", "roadmap", "timeline");
    else if (motif === "whole-process-template") keywords.push("整组流程组件", "流程组件", "步骤组件", "process diagram");
    else if (motif === "lens-funnel-flow") keywords.push("放大镜流程", "漏斗流程", "需求分析", "聚焦分析", "magnifier funnel", "lens funnel");
    else if (motif === "branch-card-flow") keywords.push("分支卡片流程", "树状卡片流程", "输出卡片", "branch cards", "card branch flow");
    else if (motif === "layered-stack") keywords.push("分层图", "层级图", "阶梯图", "layered stack");
    else if (motif === "funnel-stack") keywords.push("漏斗图", "分层漏斗", "漏斗组件", "funnel diagram");
    else if (motif === "pyramid-stack") keywords.push("金字塔", "金字塔图", "金字塔组件", "pyramid diagram");
    else if (motif === "venn-overlap") keywords.push("Venn图", "韦恩图", "集合关系", "重叠关系", "venn diagram");
    else if (motif === "intersection-overlap") keywords.push("交集关系", "交集图", "重叠交集", "intersection diagram");
    else if (motif === "milestone-roadmap") keywords.push("时间轴", "里程碑", "路线图", "roadmap", "milestone timeline");
    else if (motif === "gantt-roadmap") keywords.push("甘特图", "项目排期", "排期路线图", "计划时间轴", "gantt chart", "project schedule");
    else if (motif === "quadrant-axis") keywords.push("四象限", "象限图", "优先级矩阵", "影响成本矩阵", "impact effort matrix");
    else if (motif === "pie-share-chart") keywords.push("饼图", "扇区占比图", "份额占比图", "pie chart", "proportion chart");
    else if (motif === "bubble-scatter-chart") keywords.push("气泡图", "气泡矩阵", "组合分布图", "产品组合矩阵", "定位图", "bubble chart", "portfolio bubble chart");
    else if (motif === "topology-triangle") keywords.push("拓扑三角", "铁三角关系", "三角关系图", "triangle topology", "relationship triangle");
  }
  return compact(keywords);
}

function targetMotifTokens(targetMotifs = []) {
  const tokens = [];
  for (const keyword of targetMotifKeywords(targetMotifs)) {
    tokens.push(keyword);
    if (/圆弧|环形|循环/.test(keyword)) tokens.push("arc", "cycle", "loop");
    if (/树状|组织|部门|岗位|汇报|上下级|层级|org|organization/i.test(keyword)) tokens.push("tree", "hierarchy", "org", "organization");
    if (/鱼骨|因果|根因|ishikawa|cause|effect/i.test(keyword)) tokens.push("fishbone", "cause", "effect", "root");
    if (/截图|界面|页面|标注|批注|注释|说明气泡|高亮|框选|圈选|callout|annotation|highlight|spotlight|screenshot/i.test(keyword)) tokens.push("screenshot", "annotation", "callout", "highlight");
    if (/产品截图|界面展示|截图卡片|截图宫格|多屏展示|mockup cards|screen gallery|ui showcase|screen placeholder/i.test(keyword)) tokens.push("screenshot", "mockup", "gallery", "showcase", "card");
    if (/图示样例|组件预览|插件预览|素材预览|示例图示|图形示例|diagram sample|component preview|visual example/i.test(keyword)) tokens.push("visual", "example", "sample", "preview", "card");
    if (/局部放大|放大镜|放大框|细节放大|zoom|magnifier|loupe/i.test(keyword)) tokens.push("zoom", "magnifier", "detail", "lens");
    if (/功能卡片|图标卡片|特性卡片|能力卡片|亮点卡片|feature cards|icon cards|capability cards|图标组件|icon set|pictogram/i.test(keyword)) tokens.push("feature", "icon", "card", "capability");
    if (/步骤卡片|编号流程|序号卡片|阶段卡片|流程卡片|编号圆点|步骤编号|step cards|numbered process|sequence cards|step badge|number badge/i.test(keyword)) tokens.push("step", "numbered", "badge", "process", "card");
    if (/矩阵|宫格/.test(keyword)) tokens.push("matrix", "grid");
    if (/数据看板|kpi|指标|仪表盘|dashboard/i.test(keyword)) tokens.push("dashboard", "kpi", "metric", "card");
    if (/对比|比较|竞品|优劣|优缺点|comparison|compare|before|after/i.test(keyword)) tokens.push("comparison", "compare", "versus", "matrix");
    if (/热力|风险|色阶|色块|heatmap|risk|color/i.test(keyword)) tokens.push("heatmap", "risk", "color", "matrix");
    if (/矩形树图|树图|面积|构成|份额|treemap|area|composition|share/i.test(keyword)) tokens.push("treemap", "area", "composition", "share");
    if (/桑基|流向|流量|流转|能量流|sankey|alluvial|flow distribution/i.test(keyword)) tokens.push("sankey", "alluvial", "flow", "distribution");
    if (/地图|中国地图|世界地图|区域|地理|map|choropleth|geo/i.test(keyword)) tokens.push("map", "geo", "region", "choropleth");
    if (/词云|关键词云|标签云|文字云|热词|word cloud|tag cloud/i.test(keyword)) tokens.push("word", "cloud", "keyword", "tag");
    if (/瀑布|增减|差异桥|waterfall|variance bridge/i.test(keyword)) tokens.push("waterfall", "bridge", "variance");
    if (/仪表图|仪表盘图|速度表|半圆仪表|进度仪表|gauge|speedometer/i.test(keyword)) tokens.push("gauge", "speedometer", "dial");
    if (/雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|radar|spider/i.test(keyword)) tokens.push("radar", "spider", "polar");
    if (/辐射|径向/.test(keyword)) tokens.push("radial", "hub", "spoke");
    if (/同心圆|洋葱图|圈层|层级圆|嵌套圆|concentric|onion/i.test(keyword)) tokens.push("concentric", "onion", "nested", "rings");
    if (/箭头|流程|步骤|组件/.test(keyword)) tokens.push("arrow", "process", "flow", "step");
    if (/分层|层级|阶梯|漏斗|金字塔/.test(keyword)) tokens.push("layered", "stack", "funnel", "pyramid");
    if (/venn|韦恩|集合|交集|重叠/i.test(keyword)) tokens.push("venn", "overlap", "intersection", "set");
    if (/时间轴|里程碑|路线图|roadmap|timeline|milestone/i.test(keyword)) tokens.push("timeline", "roadmap", "milestone");
    if (/四象限|象限|优先级|影响|成本|impact|effort/i.test(keyword)) tokens.push("quadrant", "priority", "matrix", "axis");
    if (/饼图|扇区|份额|pie|proportion/i.test(keyword)) tokens.push("pie", "share", "ratio");
    if (/气泡|散点|分布|定位|组合|bubble|scatter|portfolio/i.test(keyword)) tokens.push("bubble", "scatter", "portfolio", "distribution");
    if (/拓扑|铁三角|三角|triangle|topology/i.test(keyword)) tokens.push("topology", "triangle", "relationship");
  }
  return compact(tokens);
}

function normalizeTargetMotifs(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|fishbone-cause|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/.test(value)))];
}

function normalizeStructureSignature(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stepCount = Number(value.stepCount);
  const rows = Number(value.rows);
  const columns = Number(value.columns);
  return {
    layout: String(value.layout || "").trim(),
    stepCount: Number.isFinite(stepCount) && stepCount > 0 ? Math.floor(stepCount) : null,
    rows: Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : null,
    columns: Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : null,
    direction: String(value.direction || "").trim(),
    wholeGroupTemplatePriority: String(value.wholeGroupTemplatePriority || "").trim(),
    regularSpacing: value.regularSpacing === true
  };
}

function structureSignatureKeywords(signature) {
  if (!signature) return [];
  const keywords = [];
  const stepCount = Number(signature.stepCount || 0);
  const levelCount = Number(signature.rows || 0);
  const rowCount = Number(signature.rows || 0);
  const columnCount = Number(signature.columns || 0);
  const zhStepCount = chineseSmallNumber(stepCount);
  const zhLevelCount = chineseSmallNumber(levelCount);
  const zhRowCount = chineseSmallNumber(rowCount);
  const zhColumnCount = chineseSmallNumber(columnCount);
  if (signature.wholeGroupTemplatePriority === "high") keywords.push("整组流程组件");
  if (stepCount >= 3 && stepCount <= 12) {
    keywords.push(`${stepCount}步流程`, `${stepCount}项流程`, `${stepCount}项流程图`);
    if (zhStepCount) keywords.push(`${zhStepCount}步流程`, `${zhStepCount}项流程`, `${zhStepCount}项流程图`);
  }
  if (signature.layout === "linear-process") {
    keywords.push("横向流程", "横向步骤", "linear process");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}项箭头流程`, `${stepCount}步箭头流程`);
      if (zhStepCount) keywords.push(`${zhStepCount}项箭头流程`, `${zhStepCount}步箭头流程`);
    }
  }
  if (signature.layout === "cycle-loop") {
    keywords.push("循环流程", "环形流程", "循环箭头", "圆弧箭头", "弧形箭头", "旋转箭头", "闭环组件", "循环箭头组件", "环形箭头组件", "弧形箭头组件");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}项循环`, `${stepCount}项循环箭头`, `${stepCount}段圆弧箭头`, `${stepCount}段闭环流程`);
      if (zhStepCount) keywords.push(`${zhStepCount}项循环`, `${zhStepCount}项循环箭头`, `${zhStepCount}段圆弧箭头`, `${zhStepCount}段闭环流程`);
    }
  }
  if (signature.layout === "funnel-lens-flow") {
    keywords.push("放大镜流程", "漏斗流程", "需求分析流程", "聚焦分析流程", "收敛流程组件", "magnifier funnel", "lens funnel", "analysis funnel");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}步需求分析`, `${stepCount}项收敛流程`, `${stepCount}节点放大镜流程`, `${stepCount}阶段漏斗分析`);
      if (zhStepCount) keywords.push(`${zhStepCount}步需求分析`, `${zhStepCount}项收敛流程`, `${zhStepCount}节点放大镜流程`, `${zhStepCount}阶段漏斗分析`);
    }
  }
  if (signature.layout === "swimlane") {
    keywords.push("泳道流程", "跨部门流程", "泳道图", "分栏流程", "多角色流程", "swimlane process", "cross functional flowchart", "lane based process");
    if (rowCount >= 2 && rowCount <= 8) {
      keywords.push(`${rowCount}泳道流程`, `${rowCount}角色流程`, `${rowCount}行泳道图`);
      if (zhRowCount) keywords.push(`${zhRowCount}泳道流程`, `${zhRowCount}角色流程`, `${zhRowCount}行泳道图`);
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}步泳道流程`, `${stepCount}节点跨部门流程`);
      if (zhStepCount) keywords.push(`${zhStepCount}步泳道流程`, `${zhStepCount}节点跨部门流程`);
    }
  }
  if (signature.layout === "fishbone") {
    keywords.push("鱼骨图组件", "因果分析图", "根因分析图", "Ishikawa diagram", "cause effect diagram", "6M鱼骨图");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}分支鱼骨图`, `${stepCount}项因果分析`, `${stepCount}类根因分析`);
      if (zhStepCount) keywords.push(`${zhStepCount}分支鱼骨图`, `${zhStepCount}项因果分析`, `${zhStepCount}类根因分析`);
    }
  }
  if (signature.layout === "radial") {
    keywords.push("中心辐射", "放射关系图", "径向关系", "中心关系图", "辐射关系组件", "中心发散图");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}端中心辐射`, `${stepCount}项放射关系`, `${stepCount}节点关系图`, `${stepCount}分支中心关系图`);
      if (zhStepCount) keywords.push(`${zhStepCount}端中心辐射`, `${zhStepCount}项放射关系`, `${zhStepCount}节点关系图`, `${zhStepCount}分支中心关系图`);
    }
  }
  if (signature.layout === "tree") {
    keywords.push("组织架构组件", "层级结构组件", "树状图组件", "层级关系图", "上下级关系图", "organization chart", "hierarchy chart", "tree diagram");
    if (stepCount >= 3 && stepCount <= 20) {
      keywords.push(`${stepCount}节点组织架构`, `${stepCount}项层级结构`, `${stepCount}节点树状图`);
      if (zhStepCount) keywords.push(`${zhStepCount}节点组织架构`, `${zhStepCount}项层级结构`, `${zhStepCount}节点树状图`);
    }
    if (levelCount >= 2 && levelCount <= 8) {
      keywords.push(`${levelCount}层组织架构`, `${levelCount}层层级结构`, `${levelCount}级树状图`);
      if (zhLevelCount) keywords.push(`${zhLevelCount}层组织架构`, `${zhLevelCount}层层级结构`, `${zhLevelCount}级树状图`);
    }
  }
  if (signature.layout === "topology") {
    keywords.push("拓扑关系图", "铁三角关系", "三角关系图", "三元关系图", "闭环关系图", "拓扑三角组件", "triangle topology", "relationship triangle");
    if (stepCount >= 3 && stepCount <= 6) {
      keywords.push(`${stepCount}节点拓扑图`, `${stepCount}角关系图`, `${stepCount}元关系图`);
      if (zhStepCount) keywords.push(`${zhStepCount}节点拓扑图`, `${zhStepCount}角关系图`, `${zhStepCount}元关系图`);
    }
  }
  if (signature.layout === "concentric-circles") {
    keywords.push("同心圆组件", "洋葱图组件", "圈层模型", "层级圆", "嵌套圆", "concentric circles", "onion diagram");
    if (stepCount >= 2 && stepCount <= 8) {
      keywords.push(`${stepCount}层同心圆`, `${stepCount}层洋葱图`, `${stepCount}圈层模型`);
      if (zhStepCount) keywords.push(`${zhStepCount}层同心圆`, `${zhStepCount}层洋葱图`, `${zhStepCount}圈层模型`);
    }
  }
  if (signature.layout === "screenshot-annotation") {
    keywords.push("截图标注组件", "界面标注组件", "页面批注组件", "说明气泡组件", "标注框组件", "高亮框组件", "screenshot callout", "annotated screenshot");
    if (stepCount >= 1 && stepCount <= 8) {
      keywords.push(`${stepCount}处截图标注`, `${stepCount}个说明气泡`, `${stepCount}个高亮标记`);
      if (zhStepCount) keywords.push(`${zhStepCount}处截图标注`, `${zhStepCount}个说明气泡`, `${zhStepCount}个高亮标记`);
    }
  }
  if (signature.layout === "screenshot-zoom-callout") {
    keywords.push("局部放大组件", "放大镜标注组件", "截图局部放大", "细节放大组件", "放大框组件", "zoom callout", "magnifier callout", "detail zoom");
    if (stepCount >= 2 && stepCount <= 8) {
      keywords.push(`${stepCount}处局部放大`, `${stepCount}个放大标注`, `${stepCount}个放大框`);
      if (zhStepCount) keywords.push(`${zhStepCount}处局部放大`, `${zhStepCount}个放大标注`, `${zhStepCount}个放大框`);
    }
  }
  if (signature.layout === "screenshot-card-grid") {
    keywords.push("产品截图展示", "界面展示组件", "截图卡片组件", "截图宫格", "多屏展示", "mockup cards", "screen gallery", "ui showcase");
    if (rowCount >= 1 && rowCount <= 6 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列截图卡片`, `${columnCount}列界面展示`, `${rowCount}x${columnCount} mockup cards`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列截图卡片`, `${zhColumnCount}列界面展示`);
    }
    if (stepCount >= 2 && stepCount <= 12) {
      keywords.push(`${stepCount}个产品截图`, `${stepCount}个界面卡片`, `${stepCount}屏展示`);
      if (zhStepCount) keywords.push(`${zhStepCount}个产品截图`, `${zhStepCount}个界面卡片`, `${zhStepCount}屏展示`);
    }
  }
  if (signature.layout === "visual-example-card-grid") {
    keywords.push("图示样例卡片", "组件预览卡片", "素材预览卡片", "示例图示卡片", "图形示例展示", "diagram sample cards", "component preview cards", "visual example cards");
    if (rowCount >= 1 && rowCount <= 6 && columnCount >= 1 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列图示样例`, `${columnCount}列组件预览`, `${rowCount}x${columnCount} visual example cards`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列图示样例`, `${zhColumnCount}列组件预览`);
    }
    if (stepCount >= 2 && stepCount <= 12) {
      keywords.push(`${stepCount}个图示样例`, `${stepCount}个组件预览`, `${stepCount}个素材卡片`);
      if (zhStepCount) keywords.push(`${zhStepCount}个图示样例`, `${zhStepCount}个组件预览`, `${zhStepCount}个素材卡片`);
    }
  }
  if (signature.layout === "feature-icon-card-grid") {
    keywords.push("功能卡片组件", "图标卡片组件", "特性卡片组件", "能力卡片组件", "亮点卡片", "feature cards", "icon cards", "capability cards");
    if (rowCount >= 1 && rowCount <= 6 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列功能卡片`, `${columnCount}列图标卡片`, `${rowCount}x${columnCount} feature cards`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列功能卡片`, `${zhColumnCount}列图标卡片`);
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}项功能卡片`, `${stepCount}个图标卡片`, `${stepCount}个能力卡片`);
      if (zhStepCount) keywords.push(`${zhStepCount}项功能卡片`, `${zhStepCount}个图标卡片`, `${zhStepCount}个能力卡片`);
    }
  }
  if (signature.layout === "numbered-step-card-grid") {
    keywords.push("步骤卡片组件", "编号流程组件", "序号卡片组件", "阶段卡片组件", "分步说明组件", "step cards", "numbered process cards", "sequence cards");
    if (rowCount >= 1 && rowCount <= 6 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列步骤卡片`, `${columnCount}列编号流程`, `${rowCount}x${columnCount} step cards`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列步骤卡片`, `${zhColumnCount}列编号流程`);
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}步流程卡片`, `${stepCount}个步骤卡片`, `${stepCount}步编号流程`);
      if (zhStepCount) keywords.push(`${zhStepCount}步流程卡片`, `${zhStepCount}个步骤卡片`, `${zhStepCount}步编号流程`);
    }
  }
  if (signature.layout === "vertical-process") keywords.push("纵向流程", "垂直流程", "vertical process");
  if (signature.layout === "swimlane") keywords.push("泳道流程", "多泳道流程", "swimlane process");
  if (signature.layout === "grid" || signature.layout === "matrix") {
    keywords.push("卡片矩阵", "矩阵卡片", "宫格卡片", "二维矩阵组件", "信息矩阵组件");
    if (rowCount >= 2 && rowCount <= 6 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(
        `${rowCount}行${columnCount}列矩阵`,
        `${rowCount}行${columnCount}列卡片`,
        `${rowCount}x${columnCount} matrix`,
        `${columnCount}列卡片矩阵`,
        `${rowCount}行卡片矩阵`
      );
      if (zhRowCount && zhColumnCount) {
        keywords.push(
          `${zhRowCount}行${zhColumnCount}列矩阵`,
          `${zhRowCount}行${zhColumnCount}列卡片`,
          `${zhColumnCount}列卡片矩阵`,
          `${zhRowCount}行卡片矩阵`
        );
      }
      if (rowCount === 2 && columnCount === 2) keywords.push("四象限", "四象限矩阵", "2x2 quadrant");
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}宫格卡片`, `${stepCount}项矩阵`, `${stepCount}格矩阵`);
      if (zhStepCount) keywords.push(`${zhStepCount}宫格卡片`, `${zhStepCount}项矩阵`, `${zhStepCount}格矩阵`);
    }
  }
  if (signature.layout === "dashboard-card-grid") {
    keywords.push("数据看板组件", "KPI卡片组件", "指标卡片", "仪表盘卡片", "dashboard cards", "kpi dashboard");
    if (rowCount >= 1 && rowCount <= 6 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列数据看板`, `${rowCount}行${columnCount}列KPI卡片`, `${columnCount}列指标卡片`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列数据看板`, `${zhColumnCount}列指标卡片`);
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}项KPI看板`, `${stepCount}张指标卡片`, `${stepCount} metric cards`);
      if (zhStepCount) keywords.push(`${zhStepCount}项KPI看板`, `${zhStepCount}张指标卡片`);
    }
  }
  if (signature.layout === "comparison-matrix") {
    keywords.push("对比矩阵组件", "方案对比组件", "竞品对比表", "优劣对比图", "优缺点对比", "comparison table", "before after comparison");
    if (rowCount >= 2 && rowCount <= 8 && columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${rowCount}行${columnCount}列对比矩阵`, `${columnCount}列方案对比`, `${columnCount}列竞品对比`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列对比矩阵`, `${zhColumnCount}列方案对比`);
    }
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}项对比`, `${stepCount}格对比矩阵`, `${stepCount}项方案对比`);
      if (zhStepCount) keywords.push(`${zhStepCount}项对比`, `${zhStepCount}格对比矩阵`, `${zhStepCount}项方案对比`);
    }
  }
  if (signature.layout === "heatmap-matrix") {
    keywords.push("热力图组件", "热力矩阵", "风险矩阵", "色阶矩阵", "色块矩阵", "分布矩阵", "heatmap template", "risk matrix");
    if (rowCount >= 2 && rowCount <= 8 && columnCount >= 2 && columnCount <= 8) {
      keywords.push(`${rowCount}行${columnCount}列热力图`, `${rowCount}行${columnCount}列风险矩阵`, `${columnCount}列色阶矩阵`);
      if (zhRowCount && zhColumnCount) keywords.push(`${zhRowCount}行${zhColumnCount}列热力图`, `${zhColumnCount}列色阶矩阵`);
    }
    if (stepCount >= 4 && stepCount <= 36) {
      keywords.push(`${stepCount}格热力图`, `${stepCount}格风险矩阵`, `${stepCount}项色阶矩阵`);
      if (zhStepCount) keywords.push(`${zhStepCount}格热力图`, `${zhStepCount}格风险矩阵`);
    }
  }
  if (signature.layout === "treemap") {
    keywords.push("矩形树图组件", "面积占比图", "构成分布图", "份额构成图", "市场份额图", "treemap template", "area composition");
    if (stepCount >= 3 && stepCount <= 16) {
      keywords.push(`${stepCount}块矩形树图`, `${stepCount}项面积占比`, `${stepCount}项构成分布`);
      if (zhStepCount) keywords.push(`${zhStepCount}块矩形树图`, `${zhStepCount}项面积占比`, `${zhStepCount}项构成分布`);
    }
  }
  if (signature.layout === "sankey-flow") {
    keywords.push("桑基图组件", "流向图组件", "流量分布图", "流转分布图", "能量流图", "sankey diagram", "alluvial diagram");
    if (stepCount >= 3 && stepCount <= 16) {
      keywords.push(`${stepCount}节点桑基图`, `${stepCount}项流向图`, `${stepCount}项流量分布`);
      if (zhStepCount) keywords.push(`${zhStepCount}节点桑基图`, `${zhStepCount}项流向图`, `${zhStepCount}项流量分布`);
    }
    if (columnCount >= 2 && columnCount <= 6) {
      keywords.push(`${columnCount}列流向图`, `${columnCount}列桑基图`);
      if (zhColumnCount) keywords.push(`${zhColumnCount}列流向图`, `${zhColumnCount}列桑基图`);
    }
  }
  if (signature.layout === "geo-map") {
    keywords.push("地图组件", "地图图表", "中国地图组件", "区域地图", "地理分布图", "地图热力图", "choropleth map", "geo map template");
  }
  if (signature.layout === "word-cloud") {
    keywords.push("词云组件", "关键词云", "标签云", "文字云", "热词云", "word cloud template", "tag cloud");
  }
  if (signature.layout === "waterfall-chart") {
    keywords.push("瀑布图组件", "增减分析图", "差异桥图", "waterfall chart template", "variance bridge");
    if (stepCount >= 4 && stepCount <= 16) {
      keywords.push(`${stepCount}柱瀑布图`, `${stepCount}项增减分析`, `${stepCount}项差异桥图`);
      if (zhStepCount) keywords.push(`${zhStepCount}柱瀑布图`, `${zhStepCount}项增减分析`, `${zhStepCount}项差异桥图`);
    }
  }
  if (signature.layout === "gauge-chart") {
    keywords.push("仪表图组件", "仪表盘图", "速度表组件", "半圆仪表", "进度仪表", "gauge chart template", "speedometer chart");
    if (stepCount >= 1 && stepCount <= 6) {
      keywords.push(`${stepCount}项仪表图`, `${stepCount}个仪表盘`, `${stepCount}项进度仪表`);
      if (zhStepCount) keywords.push(`${zhStepCount}项仪表图`, `${zhStepCount}个仪表盘`, `${zhStepCount}项进度仪表`);
    }
  }
  if (signature.layout === "radar-chart") {
    keywords.push("雷达图组件", "蛛网图组件", "能力雷达图", "维度评分图", "radar chart template", "spider chart");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}维雷达图`, `${stepCount}轴雷达图`, `${stepCount}项能力评分`);
      if (zhStepCount) keywords.push(`${zhStepCount}维雷达图`, `${zhStepCount}轴雷达图`, `${zhStepCount}项能力评分`);
    }
  }
  if (signature.layout === "quadrant") {
    keywords.push("四象限组件", "象限图组件", "优先级矩阵", "二维坐标矩阵", "影响成本矩阵", "价值难度矩阵", "impact effort matrix", "2x2 quadrant");
    keywords.push("2行2列象限", "二行二列象限", "四象限矩阵", "四象限分析图");
  }
  if (signature.layout === "bar-chart") {
    keywords.push("柱状图组件", "图表组件", "数据图表组件");
    if (signature.direction === "horizontal-bars" || signature.direction === "stacked-horizontal-bars") keywords.push("横向条形图", "条形图组件", "horizontal bar chart");
    if (signature.direction === "vertical-bars") keywords.push("纵向柱状图", "柱形图组件", "vertical column chart");
    if (signature.direction === "stacked-horizontal-bars") keywords.push("堆叠条形图", "堆叠柱状图", "stacked bar chart");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}柱柱状图`, `${stepCount}组柱状图`, `${stepCount}条条形图`);
      if (zhStepCount) keywords.push(`${zhStepCount}柱柱状图`, `${zhStepCount}组柱状图`, `${zhStepCount}条条形图`);
    }
  }
  if (signature.layout === "line-chart") {
    keywords.push("折线图组件", "趋势图组件", "走势图组件", "line chart template");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}点折线图`, `${stepCount}段趋势图`, `${stepCount}项趋势图`);
      if (zhStepCount) keywords.push(`${zhStepCount}点折线图`, `${zhStepCount}段趋势图`, `${zhStepCount}项趋势图`);
    }
  }
  if (signature.layout === "scatter-chart") {
    keywords.push("散点图组件", "气泡图组件", "气泡矩阵组件", "组合分布图", "定位图组件", "产品组合矩阵", "scatter chart template", "bubble chart template");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}点散点图`, `${stepCount}个数据点`, `${stepCount}项分布图`, `${stepCount}气泡分布图`);
      if (zhStepCount) keywords.push(`${zhStepCount}点散点图`, `${zhStepCount}个数据点`, `${zhStepCount}项分布图`, `${zhStepCount}气泡分布图`);
    }
  }
  if (signature.layout === "donut-chart") {
    keywords.push("环形图组件", "占比图组件", "饼图组件", "donut chart template");
    if (signature.direction === "segmented-ring") keywords.push("分段环形图", "多段占比图", "segmented donut chart");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}段环形图`, `${stepCount}项占比图`, `${stepCount}扇区饼图`);
      if (zhStepCount) keywords.push(`${zhStepCount}段环形图`, `${zhStepCount}项占比图`, `${zhStepCount}扇区饼图`);
    }
  }
  if (signature.layout === "pie-chart") {
    keywords.push("饼图组件", "扇区占比图", "份额占比图", "比例饼图", "pie chart template");
    if (signature.direction === "segmented-pie") keywords.push("分段饼图", "多扇区饼图", "segmented pie chart");
    if (stepCount >= 2 && stepCount <= 12) {
      keywords.push(`${stepCount}扇区饼图`, `${stepCount}项占比图`, `${stepCount}项份额图`);
      if (zhStepCount) keywords.push(`${zhStepCount}扇区饼图`, `${zhStepCount}项占比图`, `${zhStepCount}项份额图`);
    }
  }
  if (signature.layout === "layered-stack") {
    keywords.push("分层图组件", "层级图组件", "阶梯图组件", "金字塔组件", "漏斗组件", "layered stack diagram");
    if (signature.direction === "funnel-down") keywords.push("分层漏斗", "漏斗图组件", "漏斗层级图", "funnel diagram");
    if (signature.direction === "pyramid-down") keywords.push("金字塔图", "金字塔层级图", "pyramid diagram");
    if (signature.direction === "layered") keywords.push("分层结构图", "层叠结构图", "layered hierarchy");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}层金字塔`, `${stepCount}层漏斗`, `${stepCount}层分层图`, `${stepCount}阶层级图`);
      if (zhStepCount) keywords.push(`${zhStepCount}层金字塔`, `${zhStepCount}层漏斗`, `${zhStepCount}层分层图`, `${zhStepCount}阶层级图`);
    }
  }
  if (signature.layout === "venn-overlap") {
    keywords.push("Venn图组件", "韦恩图组件", "集合关系图", "交集关系图", "重叠关系图", "venn diagram");
    if (stepCount >= 2 && stepCount <= 5) {
      keywords.push(`${stepCount}圆Venn图`, `${stepCount}集合关系`, `${stepCount}集合交集图`, `${stepCount}圈重叠图`);
      if (zhStepCount) keywords.push(`${zhStepCount}圆Venn图`, `${zhStepCount}集合关系`, `${zhStepCount}集合交集图`, `${zhStepCount}圈重叠图`);
    }
  }
  if (signature.layout === "tree") {
    keywords.push("树状层级", "组织结构图", "组织架构组件", "部门架构图", "岗位层级图", "汇报关系图", "hierarchy diagram", "org chart", "分支层级组件", "树状关系组件", "上下级关系图");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}节点树状图`, `${stepCount}节点组织结构图`, `${stepCount}人组织架构`, `${stepCount}岗位层级图`, `${stepCount}分支层级图`);
      if (zhStepCount) keywords.push(`${zhStepCount}节点树状图`, `${zhStepCount}节点组织结构图`, `${zhStepCount}人组织架构`, `${zhStepCount}岗位层级图`, `${zhStepCount}分支层级图`);
    }
    if (levelCount >= 2 && levelCount <= 6) {
      keywords.push(`${levelCount}层组织结构图`, `${levelCount}层组织架构`, `${levelCount}层层级关系图`);
      if (zhLevelCount) keywords.push(`${zhLevelCount}层组织结构图`, `${zhLevelCount}层组织架构`, `${zhLevelCount}层层级关系图`);
    }
  }
  if (signature.layout === "timeline") {
    keywords.push("时间轴组件", "里程碑组件", "路线图组件", "roadmap timeline", "timeline component");
    if (stepCount >= 3 && stepCount <= 12) {
      keywords.push(`${stepCount}点时间轴`, `${stepCount}阶段路线图`, `${stepCount}里程碑时间轴`, `${stepCount}节点路线图`);
      if (zhStepCount) keywords.push(`${zhStepCount}点时间轴`, `${zhStepCount}阶段路线图`, `${zhStepCount}里程碑时间轴`, `${zhStepCount}节点路线图`);
    }
  }
  if (signature.layout === "gantt-roadmap") {
    keywords.push("甘特图组件", "项目排期组件", "排期路线图", "计划时间轴", "gantt chart", "project schedule timeline");
    if (rowCount >= 3 && rowCount <= 12) {
      keywords.push(`${rowCount}行甘特图`, `${rowCount}项项目排期`, `${rowCount}条排期路线图`);
      if (zhRowCount) keywords.push(`${zhRowCount}行甘特图`, `${zhRowCount}项项目排期`, `${zhRowCount}条排期路线图`);
    }
  }
  if (signature.regularSpacing && stepCount >= 3) keywords.push("等距步骤流程", "均分流程图");
  if (signature.wholeGroupTemplatePriority === "high") keywords.push("一体化流程图");
  if (stepCount >= 3 && stepCount <= 12) keywords.push(`${stepCount}步骤流程`, `${stepCount} step process`);
  return compact(keywords);
}

function chineseSmallNumber(value) {
  const map = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
    10: "十",
    11: "十一",
    12: "十二"
  };
  return map[Math.trunc(Number(value))] || "";
}

function rationaleFor({ provider, kind, family, strategy }) {
  if (provider === "islide" && kind === "diagram") return `search iSlide polished ${family} diagram references before primitive reconstruction`;
  if (provider === "islide" && kind === "smartdiagram") return "search iSlide smart diagram references for higher-level structure hints";
  if (provider === "islide") return `search iSlide ${kind} library for reusable visual references`;
  if (kind === "component") return `search grouped ${family} PPT components before primitive reconstruction`;
  if (kind === "shape") return "search OfficePLUS shape styles for native shape replacement";
  if (kind === "vector") return "search vector illustrations for icon/diagram style matching";
  if (kind === "icon") return "search icon groups for replacing local icon crops";
  if (kind === "ppt") return "search full PPT templates for layout/style references";
  return strategy.reason || "search plugin component candidates";
}

function collectContextText(context = {}) {
  return [
    context.keywords,
    context.title,
    context.description,
    ...(Array.isArray(context.textBoxes) ? context.textBoxes.map((item) => item?.text) : [])
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ").slice(0, 120);
}

function familyTokens(family) {
  if (family === "cycle-loop") return ["闭环", "循环", "环形", "箭头"];
  if (family === "funnel-lens-flow") return ["放大镜", "漏斗", "分析"];
  if (family === "fishbone-cause-effect") return ["鱼骨", "因果", "根因"];
  if (family === "process-chain") return ["流程", "步骤"];
  if (family === "timeline") return ["时间轴", "里程碑"];
  if (family === "hierarchy-tree") return ["组织架构", "层级", "树状图"];
  if (family === "hub-spoke") return ["关系", "中心"];
  if (family === "quadrant-matrix") return ["四象限", "矩阵"];
  if (family === "comparison-matrix") return ["对比", "比较", "矩阵"];
  if (family === "pie-chart") return ["饼图", "扇区", "占比"];
  if (family === "grid-or-matrix") return ["矩阵", "表格"];
  if (family === "icon-or-illustration") return ["图标", "插图"];
  return [family].filter(Boolean);
}

function normalizeTemplateFamily(templateFamily, archetype, context = {}) {
  const rawFamily = String(templateFamily || "").trim();
  const rawArchetype = String(archetype || "").trim();
  const layerType = String(context.layerType || "").trim();
  const contextText = collectContextText(context);
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "screenshot-card-grid";
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "visual-example-card-grid";
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "feature-icon-card-grid";
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|milestone[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "numbered-step-card-grid";
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier[-_\s]?callout|detail[-_\s]?zoom|局部放大|放大镜标注|放大框|放大区域|细节放大/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "screenshot-zoom-callout";
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|screen[-_\s]?callout|ui[-_\s]?annotation|截图标注|界面标注|页面标注|标注截图|批注截图|说明气泡|高亮框|框选|圈选|局部放大/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "screenshot-annotation";
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "concentric-circles";
  if (/topology[-_\s]?diagram|triangle[-_\s]?topology|relationship[-_\s]?triangle|iron[-_\s]?triangle|拓扑关系|拓扑图|铁三角|三角关系|三元关系/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "topology-diagram";
  if (/cycle|loop|闭环|循环|环形|双环/.test(`${rawFamily} ${rawArchetype}`) || /闭环|循环|环形|双环|DOM\s*语义|交互原型/.test(contextText)) return "cycle-loop";
  if (/funnel[-_\s]?lens|lens[-_\s]?funnel|magnifier|converge|放大镜流程|漏斗流程|收敛流程|聚焦分析|需求分析/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "funnel-lens-flow";
  if (/fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|鱼骨图|因果分析|根因分析/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "fishbone-cause-effect";
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|面积占比|面积分布|构成占比|份额构成/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "treemap-chart";
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "sankey-flow-chart";
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "map-chart";
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "word-cloud-chart";
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "waterfall-chart";
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "gauge-chart";
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "radar-chart";
  if (/swimlane|cross[-_\s]?functional|lane[-_\s]?based|泳道|跨部门流程|分栏流程|多角色流程/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "swimlane-flow";
  if (/pie[-_\s]?chart|饼图|扇区占比|份额占比/.test(`${rawFamily} ${rawArchetype} ${contextText}`) && !/donut|ring|环形图|圆环/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "pie-chart";
  if (/dashboard|scorecard|kpi|metric|数据看板|指标看板|仪表盘|指标卡/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "grid-or-matrix";
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "grid-or-matrix";
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "grid-or-matrix";
  if (/quadrant|四象限|象限|优先级矩阵|影响.?成本|价值.?难度/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "quadrant-matrix";
  if (/table|matrix|grid/.test(layerType) || /matrix|grid|table|表格|矩阵/.test(rawArchetype)) return "grid-or-matrix";
  if (/hierarchy[-_\s]?tree|org[-_\s]?chart|organization[-_\s]?chart|tree[-_\s]?structure|hierarchy|组织架构|组织结构|层级结构|层级关系|树状图|上下级/.test(`${rawFamily} ${rawArchetype} ${contextText}`)) return "hierarchy-tree";
  if (/topology|拓扑/.test(rawArchetype)) return "hub-spoke";
  if (/diagram/.test(layerType) && (!rawFamily || rawFamily === "generic" || /unclassified|generic/.test(rawArchetype))) return "hub-spoke";
  const family = rawFamily && rawFamily !== "generic" ? rawFamily : rawArchetype;
  if (/cycle|loop|闭环|循环|环形|双环/.test(family) || /闭环|循环|环形|双环|DOM\s*语义|交互原型/.test(contextText)) return "cycle-loop";
  if (/funnel[-_\s]?lens|lens[-_\s]?funnel|magnifier|converge|放大镜流程|漏斗流程|收敛流程|聚焦分析|需求分析/.test(family) || /放大镜流程|漏斗流程|收敛流程|聚焦分析|需求分析|magnifier|lens funnel/.test(contextText)) return "funnel-lens-flow";
  if (/fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|鱼骨图|因果分析|根因分析/.test(family) || /fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|鱼骨图|因果分析|根因分析/.test(contextText)) return "fishbone-cause-effect";
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|面积占比|面积分布|构成占比|份额构成/.test(family) || /tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|面积占比|面积分布|构成占比|份额构成/.test(contextText)) return "treemap-chart";
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流/.test(family) || /sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流/.test(contextText)) return "sankey-flow-chart";
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(family) || /map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(contextText)) return "map-chart";
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(family) || /word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(contextText)) return "word-cloud-chart";
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(family) || /waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(contextText)) return "waterfall-chart";
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(family) || /gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(contextText)) return "gauge-chart";
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(family) || /radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(contextText)) return "radar-chart";
  if (/swimlane|cross[-_\s]?functional|lane[-_\s]?based|泳道|跨部门流程|分栏流程|多角色流程/.test(family) || /swimlane|cross[-_\s]?functional|lane[-_\s]?based|泳道|跨部门流程|分栏流程|多角色流程/.test(contextText)) return "swimlane-flow";
  if (/topology[-_\s]?diagram|triangle[-_\s]?topology|relationship[-_\s]?triangle|iron[-_\s]?triangle|拓扑关系|拓扑图|铁三角|三角关系|三元关系/.test(family) || /topology[-_\s]?diagram|triangle[-_\s]?topology|relationship[-_\s]?triangle|iron[-_\s]?triangle|拓扑关系|拓扑图|铁三角|三角关系|三元关系/.test(contextText)) return "topology-diagram";
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(family) || /screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(contextText)) return "screenshot-card-grid";
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(family) || /visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(contextText)) return "visual-example-card-grid";
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(family) || /feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(contextText)) return "feature-icon-card-grid";
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|milestone[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(family) || /numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|milestone[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(contextText)) return "numbered-step-card-grid";
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier[-_\s]?callout|detail[-_\s]?zoom|局部放大|放大镜标注|放大框|放大区域|细节放大/.test(family) || /screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier[-_\s]?callout|detail[-_\s]?zoom|局部放大|放大镜标注|放大框|放大区域|细节放大/.test(contextText)) return "screenshot-zoom-callout";
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|screen[-_\s]?callout|ui[-_\s]?annotation|截图标注|界面标注|页面标注|标注截图|批注截图|说明气泡|高亮框|框选|圈选|局部放大/.test(family) || /screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|screen[-_\s]?callout|ui[-_\s]?annotation|截图标注|界面标注|页面标注|标注截图|批注截图|说明气泡|高亮框|框选|圈选|局部放大/.test(contextText)) return "screenshot-annotation";
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(family) || /concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(contextText)) return "concentric-circles";
  if ((/pie[-_\s]?chart|饼图|扇区占比|份额占比/.test(family) || /pie[-_\s]?chart|饼图|扇区占比|份额占比/.test(contextText)) && !/donut|ring|环形图|圆环/.test(`${family} ${contextText}`)) return "pie-chart";
  if (/dashboard|scorecard|kpi|metric|数据看板|指标看板|仪表盘|指标卡/.test(family) || /dashboard|scorecard|kpi|metric|数据看板|指标看板|仪表盘|指标卡/.test(contextText)) return "grid-or-matrix";
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点/.test(family) || /comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点/.test(contextText)) return "grid-or-matrix";
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵/.test(family) || /heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵/.test(contextText)) return "grid-or-matrix";
  if (/layered|pyramid|funnel-stack|金字塔|分层|层级漏斗|阶梯/.test(family) || /金字塔|分层|层级漏斗|阶梯/.test(contextText)) return "layered-stack";
  if (/venn|overlap|intersection|韦恩|集合|交集|重叠/.test(family) || /venn|韦恩|集合|交集|重叠关系/.test(contextText)) return "venn-overlap";
  if (/quadrant|四象限|象限|优先级矩阵|影响.?成本|价值.?难度/.test(family) || /quadrant|四象限|象限|优先级矩阵|影响.?成本|价值.?难度/.test(contextText)) return "quadrant-matrix";
  if (/matrix|grid|table|表格|矩阵/.test(family)) return "grid-or-matrix";
  if (/timeline|milestone|roadmap|gantt|schedule|时间轴|里程碑|路线图|甘特|排期/.test(family) || /timeline|milestone|roadmap|gantt|schedule|时间轴|里程碑|路线图|甘特|排期/.test(contextText)) return "timeline";
  if (/hierarchy[-_\s]?tree|org[-_\s]?chart|organization[-_\s]?chart|tree[-_\s]?structure|hierarchy|组织架构|组织结构|层级结构|层级关系|树状图|上下级/.test(family) || /hierarchy[-_\s]?tree|org[-_\s]?chart|organization[-_\s]?chart|tree[-_\s]?structure|hierarchy|组织架构|组织结构|层级结构|层级关系|树状图|上下级/.test(contextText)) return "hierarchy-tree";
  if (/flow-card-chain|process|流程|步骤|chain/.test(family)) return "process-chain";
  if (/hub|spoke|cycle|radial|关系|中心|辐射/.test(family)) return "hub-spoke";
  if (/generic-node-diagram|node-diagram|节点图/.test(family)) return "hub-spoke";
  if (/timeline|milestone|roadmap|时间轴|里程碑|路线图/.test(family)) return "timeline";
  if (/icon|illustration|插图|图标/.test(family)) return "icon-or-illustration";
  return rawFamily || rawArchetype || "generic";
}

function mergeSourcePreference(sourcePreference) {
  const values = Array.isArray(sourcePreference) ? sourcePreference : [];
  return [...new Set([...values, "officeplus-search", "islide-search"])];
}

function compact(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function safeErrorMessage(error) {
  return String(error?.message || "unknown error").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>");
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  buildLegacyLayerComponentSeed,
  buildComponentSearchPlan,
  searchComponentCandidates,
  scoreCandidateDocument,
  _private: {
    islideKindsFor,
    keywordHintsFor,
    normalizeTemplateFamily,
    normalizeTargetMotifs,
    normalizeStructureSignature,
    querySpecsFor,
    querySpecsForWithKeywords,
    queryKindsFor,
    componentQueryIdentity,
    normalizeQueryConcurrency,
    readComponentQueryCache,
    writeComponentQueryCache,
    itemCountFromText,
    structureSignatureKeywords,
    targetMotifKeywords
  }
};
