"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listZipEntries, readZipEntry } = require("./lib/pptx-inventory");

const ANCHOR_PREFIX = "slideclone:componentReplacementPlan";

function parseArgs(argv) {
  const args = {
    pptx: "",
    inventory: "",
    out: "",
    minAnchors: 1,
    failOnMissingSamples: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--pptx" && next) {
      args.pptx = next;
      i += 1;
    } else if ((arg === "--inventory" || arg === "--component-inventory") && next) {
      args.inventory = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--min-anchors" && next) {
      args.minAnchors = Number(next);
      i += 1;
    } else if (arg === "--fail-on-missing-samples") {
      args.failOnMissingSamples = true;
    } else {
      throw new Error(`Unknown component-replacement-apply-plan argument: ${arg}`);
    }
  }
  if (!args.pptx) throw new Error("--pptx is required.");
  return args;
}

function buildComponentReplacementApplyPlan(options = {}) {
  const pptx = path.resolve(String(options.pptx || ""));
  if (!pptx || path.extname(pptx).toLowerCase() !== ".pptx") {
    throw new Error("--pptx must point to a .pptx file.");
  }
  if (!fs.existsSync(pptx)) throw new Error(`PPTX file was not found: ${pptx}`);

  const anchors = extractReplacementAnchorsFromPptx(pptx);
  const groups = groupAnchors(anchors);
  const inventory = options.inventory ? loadComponentInventory(options.inventory) : null;
  const operations = groups.map((group) => {
    const sample = inventory ? findReplacementSample(group, inventory) : null;
    return {
      operation: sample ? "replace-anchor-group-with-component-sample" : "missing-component-sample",
      status: sample ? "ready" : "missing_sample",
      groupKey: group.groupKey,
      provider: group.provider,
      kind: group.kind,
      componentId: group.componentId,
      layer: group.layer,
      tier: group.tier,
      score: group.score,
      title: group.title,
      targetMotifs: group.targetMotifs || [],
      anchorCount: group.anchorCount,
      slides: group.slides,
      drawingNames: group.drawingNames,
      sample,
      nextAction: sample ? null : buildMissingSampleNextAction(group)
    };
  });
  const summary = summarizePlan({ anchors, groups, operations, minAnchors: options.minAnchors });
  const plan = {
    provider: "component-replacement-apply-plan-v1",
    createdAt: new Date().toISOString(),
    pptx,
    inventory: inventory ? inventory.sourceFile : null,
    summary,
    groups,
    operations
  };
  const out = String(options.out || "").trim();
  if (out) {
    const outFile = path.resolve(out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }
  if (options.failOnMissingSamples && summary.missingSampleGroups > 0) {
    const error = new Error(`Missing component samples for ${summary.missingSampleGroups} replacement group(s).`);
    error.plan = plan;
    throw error;
  }
  return plan;
}

function extractReplacementAnchorsFromPptx(pptx) {
  const slideEntries = listZipEntries(pptx)
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(compareSlideEntryNames);
  const anchors = [];
  for (const slideEntry of slideEntries) {
    const xml = readZipEntry(pptx, slideEntry, { maxBytes: 16 * 1024 * 1024 })?.toString("utf8") || "";
    anchors.push(...extractReplacementAnchorsFromSlideXml(xml, slideEntry));
  }
  return anchors;
}

function extractReplacementAnchorsFromSlideXml(xml, slideEntry) {
  const anchors = [];
  const slideIndex = slideIndexFromEntry(slideEntry);
  const pattern = /<p:cNvPr\b([^>]*)\/?>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const attributes = parseXmlAttributes(match[1] || "");
    const description = attributes.descr || "";
    if (!description.startsWith(ANCHOR_PREFIX)) continue;
    const anchor = parseReplacementDescription(description);
    if (!anchor) continue;
    anchors.push({
      ...anchor,
      slideEntry,
      slideIndex,
      drawingId: attributes.id || null,
      drawingName: attributes.name || null,
      description
    });
  }
  return anchors;
}

function parseReplacementDescription(description) {
  const text = String(description || "").trim();
  if (!text.startsWith(ANCHOR_PREFIX)) return null;
  const fields = {};
  for (const token of text.slice(ANCHOR_PREFIX.length).trim().split(/\s+/)) {
    const equals = token.indexOf("=");
    if (equals <= 0) continue;
    const key = token.slice(0, equals);
    const value = token.slice(equals + 1);
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) fields[key] = value;
  }
  const provider = sanitizeField(fields.provider);
  const componentId = sanitizeField(fields.id);
  if (!provider || !componentId) return null;
  return {
    provider,
    kind: sanitizeField(fields.kind) || "component",
    componentId,
    layer: sanitizeField(fields.layer) || null,
    tier: sanitizeField(fields.tier) || null,
    score: parseFiniteNumber(fields.score),
    title: sanitizeField(fields.title) || null,
    targetMotifs: parseListField(fields.motifs)
  };
}

function groupAnchors(anchors) {
  const byKey = new Map();
  for (const anchor of anchors) {
    const groupKey = [
      anchor.provider,
      anchor.kind,
      anchor.componentId,
      anchor.layer || "no-layer"
    ].join(":");
    if (!byKey.has(groupKey)) {
      byKey.set(groupKey, {
        groupKey,
        provider: anchor.provider,
        kind: anchor.kind,
        componentId: anchor.componentId,
        layer: anchor.layer,
        tier: anchor.tier,
        score: anchor.score,
        title: anchor.title,
        targetMotifs: anchor.targetMotifs || [],
        anchorCount: 0,
        slides: [],
        drawingNames: [],
        anchors: []
      });
    }
    const group = byKey.get(groupKey);
    group.anchorCount += 1;
    group.anchors.push(anchor);
    group.targetMotifs = uniqueStrings([...group.targetMotifs, ...inferTargetMotifs(anchor)]);
    if (!group.slides.includes(anchor.slideIndex)) group.slides.push(anchor.slideIndex);
    if (anchor.drawingName && !group.drawingNames.includes(anchor.drawingName)) group.drawingNames.push(anchor.drawingName);
  }
  return [...byKey.values()]
    .map((group) => ({
      ...group,
      slides: group.slides.sort((a, b) => a - b),
      drawingNames: group.drawingNames.slice(0, 80)
    }))
    .sort((a, b) => b.anchorCount - a.anchorCount || a.groupKey.localeCompare(b.groupKey));
}

function loadComponentInventory(file) {
  const sourceFile = path.resolve(String(file || ""));
  if (!fs.existsSync(sourceFile)) throw new Error(`Component inventory was not found: ${sourceFile}`);
  const payload = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  const candidates = normalizeInventoryCandidates(payload);
  return {
    sourceFile,
    provider: payload.provider || null,
    candidates
  };
}

function normalizeInventoryCandidates(payload) {
  const raw = Array.isArray(payload?.candidates)
    ? payload.candidates
    : Array.isArray(payload?.components)
      ? payload.components
      : [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id || null,
      provider: item.provider || inferProviderFromCandidate(item),
      path: item.path || item.file || null,
      name: item.name || (item.path ? path.basename(String(item.path)) : null),
      assetKind: item.assetKind || null,
      roleTags: Array.isArray(item.roleTags) ? item.roleTags : [],
      score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
      sha256: typeof item.sha256 === "string" && /^[a-f0-9]{64}$/i.test(item.sha256) ? item.sha256.toLowerCase() : null,
      structureSignature: normalizeCandidateStructureSignature(item),
      learningSummary: item.learningSummary || null
    }))
    .filter((item) => item.path || item.name || item.id);
}

function findReplacementSample(group, inventory) {
  const targetId = normalizeToken(group.componentId);
  const targetProvider = normalizeToken(group.provider);
  const matches = inventory.candidates
    .map((candidate) => {
      const exactIdMatch = targetId && normalizeToken([
        candidate.id,
        candidate.provider,
        candidate.path,
        candidate.name,
        candidate.assetKind,
        ...(candidate.roleTags || [])
      ].filter(Boolean).join(" ")).includes(targetId);
      return {
        candidate,
        semanticFallback: !exactIdMatch,
        score: scoreSampleMatch(group, candidate, targetId, targetProvider)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = matches[0]?.candidate;
  if (!best) return null;
  return {
    provider: best.provider || null,
    path: best.path ? path.resolve(String(best.path)) : null,
    name: best.name || null,
    assetKind: best.assetKind || null,
    roleTags: best.roleTags || [],
    structureSignature: best.structureSignature || null,
    semanticFallback: matches[0].semanticFallback === true,
    matchScore: matches[0].score,
    ...(best.sha256 ? { sha256: best.sha256 } : {})
  };
}

function buildMissingSampleNextAction(group) {
  const provider = sanitizeCliToken(group.provider || "plugin");
  const componentId = sanitizeCliToken(group.componentId || "component");
  const searchKeywords = buildPluginSearchKeywords(group);
  return {
    reason: "No harvested plugin component deck matched the exact provider/component id.",
    requiredSample: {
      provider: group.provider,
      componentId: group.componentId,
      kind: group.kind,
      title: group.title || null,
      targetMotifs: group.targetMotifs || [],
      searchKeywords
    },
    harvestCommand: `node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider ${provider} --label ${componentId}`,
    workflow: [
      searchKeywords.length > 0
        ? `Search ${group.provider} for: ${searchKeywords.join(" / ")}.`
        : `Open the matching ${group.provider} component in PowerPoint and apply/download it into the active slide.`,
      `Apply/download ${group.componentId}${group.title ? ` (${group.title})` : ""} into the active slide.`,
      "Keep only the applied component selected when possible, or keep it on an otherwise blank slide.",
      "Run the harvestCommand, then rerun this apply-plan command with the refreshed inventory."
    ]
  };
}

function scoreSampleMatch(group, candidate, targetId, targetProvider) {
  const haystack = normalizeToken([
    candidate.id,
    candidate.provider,
    candidate.path,
    candidate.name,
    candidate.assetKind,
    ...(candidate.roleTags || [])
  ].filter(Boolean).join(" "));
  const exactIdMatch = targetId && haystack.includes(targetId);
  if (targetId && !exactIdMatch) {
    return scoreSemanticSampleMatch(group, candidate, targetProvider);
  }
  let score = 0;
  if (exactIdMatch) score += 100;
  if (targetProvider && normalizeToken(candidate.provider) === targetProvider) score += 24;
  if ((candidate.roleTags || []).includes("applied-component")) score += 20;
  if (candidate.assetKind === "presentation-template") score += 12;
  if (group.kind && haystack.includes(normalizeToken(group.kind))) score += 4;
  return score;
}

function scoreSemanticSampleMatch(group, candidate, targetProvider) {
  const targetMotifs = inferTargetMotifs(group);
  const signature = candidate.structureSignature || normalizeCandidateStructureSignature(candidate);
  const sampleMotifs = uniqueStrings([
    ...(Array.isArray(signature?.motifs) ? signature.motifs : []),
    signature?.primaryMotif
  ]);
  const readinessScore = Number(signature?.reuseReadinessScore);
  if (!Number.isFinite(readinessScore) || readinessScore < 80) return 0;
  const overlap = targetMotifs.filter((motif) => sampleMotifs.includes(motif));
  if (overlap.length === 0) return 0;
  const targetFamily = inferTemplateFamilyForMotifs(targetMotifs);
  const sampleFamily = signature?.primaryKind || inferTemplateFamilyForMotifs(sampleMotifs);
  let score = 0;
  score += Math.min(3, overlap.length) * 24;
  if (targetFamily && sampleFamily && targetFamily === sampleFamily) score += 24;
  if ((candidate.roleTags || []).includes("applied-component")) score += 16;
  if (candidate.assetKind === "presentation-template") score += 8;
  if (targetProvider && normalizeToken(candidate.provider) === targetProvider) score += 6;
  if ((candidate.roleTags || []).includes("openxml-inspectable")) score += 4;
  return score >= 70 ? score : 0;
}

function normalizeCandidateStructureSignature(item = {}) {
  const direct = item.structureSignature && typeof item.structureSignature === "object" ? item.structureSignature : null;
  if (direct) {
    return {
      primaryKind: sanitizeField(direct.primaryKind) || "",
      primaryMotif: sanitizeField(direct.primaryMotif) || "",
      motifs: sanitizeStringList(direct.motifs),
      reuseReadinessScore: parseFiniteNumber(direct.reuseReadinessScore)
    };
  }
  const summary = item.learningSummary && typeof item.learningSummary === "object" ? item.learningSummary : null;
  const signature = summary?.structureSignature && typeof summary.structureSignature === "object"
    ? summary.structureSignature
    : null;
  if (signature) {
    return {
      primaryKind: sanitizeField(signature.primaryKind) || "",
      primaryMotif: sanitizeField(signature.primaryMotif) || "",
      motifs: sanitizeStringList(signature.motifs),
      reuseReadinessScore: bestReuseReadinessScore(summary.componentCatalog)
    };
  }
  const catalog = Array.isArray(summary?.componentCatalog) ? summary.componentCatalog : [];
  const motifs = [];
  const kinds = [];
  for (const group of catalog) {
    const structure = group?.structure || {};
    if (structure.kind) kinds.push(structure.kind);
    motifs.push(...sanitizeStringList(structure.motifs));
  }
  return {
    primaryKind: kinds[0] ? sanitizeField(kinds[0]) : "",
    primaryMotif: motifs[0] ? sanitizeField(motifs[0]) : "",
    motifs: uniqueStrings(motifs),
    reuseReadinessScore: bestReuseReadinessScore(catalog)
  };
}

function inferTemplateFamilyForMotifs(motifs = []) {
  const set = new Set(motifs);
  if (set.has("arc-arrow") || set.has("ring-node")) return "cycle-loop";
  if (set.has("branch-card-flow") || set.has("linear-arrow-chain") || set.has("lens-funnel-flow")) return "process-chain";
  if (set.has("tree-link") || set.has("radial-link")) return "network-diagram";
  if (set.has("card-grid")) return "relationship-diagram";
  return "";
}

function bestReuseReadinessScore(catalog = []) {
  const scores = (Array.isArray(catalog) ? catalog : [])
    .map((group) => Number(group?.reuseReadiness?.score))
    .filter(Number.isFinite);
  return scores.length > 0 ? Math.max(...scores) : null;
}

function sanitizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => sanitizeField(value))
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeCliToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "component";
}

function summarizePlan({ anchors, groups, operations, minAnchors }) {
  const readyGroups = operations.filter((item) => item.status === "ready").length;
  const missingSampleGroups = operations.filter((item) => item.status === "missing_sample").length;
  return {
    anchorCount: anchors.length,
    groupCount: groups.length,
    readyGroups,
    missingSampleGroups,
    passedAnchorMinimum: anchors.length >= normalizePositiveInt(minAnchors, 1),
    canApplyWithoutManualHarvest: missingSampleGroups === 0 && groups.length > 0
  };
}

function parseXmlAttributes(text) {
  const attributes = {};
  const pattern = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function sanitizeField(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.replace(/[\u0000-\u001F\u007F]/g, "_").slice(0, 160);
}

function parseFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseListField(value) {
  return String(value || "")
    .split(/[,;|]/)
    .map((item) => sanitizeField(item))
    .filter(Boolean)
    .slice(0, 12);
}

function buildPluginSearchKeywords(group = {}) {
  const motifs = Array.isArray(group.targetMotifs) && group.targetMotifs.length > 0
    ? group.targetMotifs
    : inferTargetMotifs(group);
  const motifKeywords = [];
  for (const motif of motifs) {
    if (motif === "linear-arrow-chain") motifKeywords.push("流程箭头", "流程");
    else if (motif === "arc-arrow") motifKeywords.push("圆弧箭头", "循环箭头");
    else if (motif === "card-grid") motifKeywords.push("卡片矩阵", "卡片");
    else if (motif === "tree-link") motifKeywords.push("树状关系", "层级关系");
    else if (motif === "radial-link") motifKeywords.push("辐射关系", "中心关系");
    else if (motif === "lens-funnel-flow") motifKeywords.push("放大镜流程", "需求分析");
    else if (motif === "branch-card-flow") motifKeywords.push("分支卡片", "输出卡片");
  }
  return [...new Set([
    group.title,
    ...motifKeywords,
    group.componentId
  ].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 8);
}

function inferTargetMotifs(value = {}) {
  const explicit = Array.isArray(value.targetMotifs) ? value.targetMotifs.map(String).filter(Boolean) : [];
  if (explicit.length > 0) return explicit.slice(0, 12);
  const text = `${value.title || ""} ${value.componentId || ""}`.toLowerCase();
  const motifs = [];
  if (/流程|步骤|箭头|timeline|process|step/.test(text)) motifs.push("linear-arrow-chain");
  if (/循环|圆形|圆弧|环形|cycle|loop|arc/.test(text)) motifs.push("arc-arrow");
  if (/卡片|矩阵|宫格|grid|matrix|card/.test(text)) motifs.push("card-grid");
  if (/树状|层级|分支|branch|tree|hierarchy/.test(text)) motifs.push("tree-link");
  if (/放大镜|漏斗|需求分析|magnifier|funnel/.test(text)) motifs.push("lens-funnel-flow");
  return motifs.slice(0, 12);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function inferProviderFromCandidate(item) {
  const text = `${item.path || ""} ${item.name || ""}`.toLowerCase();
  if (text.includes("officeplus")) return "officeplus";
  if (text.includes("islide")) return "islide";
  return null;
}

function slideIndexFromEntry(entry) {
  const match = String(entry || "").match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : null;
}

function compareSlideEntryNames(a, b) {
  return slideIndexFromEntry(a) - slideIndexFromEntry(b);
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

async function main() {
  const args = parseArgs(process.argv);
  try {
    const plan = buildComponentReplacementApplyPlan(args);
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    if (error.plan) {
      console.log(JSON.stringify(error.plan, null, 2));
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildComponentReplacementApplyPlan,
  extractReplacementAnchorsFromPptx,
  extractReplacementAnchorsFromSlideXml,
  groupAnchors,
  loadComponentInventory,
  parseReplacementDescription
};
