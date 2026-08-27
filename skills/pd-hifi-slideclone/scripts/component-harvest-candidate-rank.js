"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    queue: "",
    manifests: [],
    roots: [],
    out: "",
    minScore: 80
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--queue" || arg === "--harvest-queue") && next) {
      args.queue = next;
      index += 1;
    } else if ((arg === "--manifest" || arg === "--component-manifest") && next) {
      args.manifests.push(next);
      index += 1;
    } else if ((arg === "--root" || arg === "--manifest-root") && next) {
      args.roots.push(next);
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--min-score" && next) {
      args.minScore = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-harvest-candidate-rank argument: ${arg}`);
    }
  }
  if (!args.queue) throw new Error("--queue is required.");
  if (args.manifests.length === 0 && args.roots.length === 0) {
    throw new Error("At least one --manifest or --root is required.");
  }
  return args;
}

function rankHarvestCandidates(options = {}) {
  const queueFile = path.resolve(String(options.queue || ""));
  if (!fs.existsSync(queueFile)) throw new Error(`Harvest queue was not found: ${queueFile}`);
  const queue = readJson(queueFile);
  const manifests = discoverManifestFiles(options);
  const components = loadComponents(manifests);
  const minScore = normalizeNumber(options.minScore, 80);
  const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
  const rankedTasks = tasks.map((task) => {
    const candidates = components
      .map((component) => scoreCandidateForTask(task, component))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.component.path.localeCompare(b.component.path));
    const best = candidates[0] || null;
    return {
      id: task.id || `${task.provider}:${task.kind}:${task.componentId}`,
      provider: task.provider || "",
      componentId: task.componentId || "",
      title: task.title || "",
      targetMotifs: sanitizeList(task.targetMotifs),
      totalAnchorCount: Number(task.totalAnchorCount || 0),
      bestStatus: best?.status === "ready_candidate" && best.score >= minScore
        ? "ready_candidate"
        : candidates.length > 0
          ? "needs_better_sample"
          : "missing_candidate",
      candidates: candidates.slice(0, 20)
    };
  });
  const report = {
    provider: "component-harvest-candidate-rank-v1",
    createdAt: new Date().toISOString(),
    queue: queueFile,
    manifests,
    minScore,
    summary: {
      tasks: rankedTasks.length,
      components: components.length,
      readyTasks: rankedTasks.filter((task) => task.bestStatus === "ready_candidate").length,
      needsBetterSampleTasks: rankedTasks.filter((task) => task.bestStatus === "needs_better_sample").length,
      missingCandidateTasks: rankedTasks.filter((task) => task.bestStatus === "missing_candidate").length
    },
    tasks: rankedTasks
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function discoverManifestFiles(options = {}) {
  const files = [];
  for (const file of Array.isArray(options.manifests) ? options.manifests : [options.manifests].filter(Boolean)) {
    const resolved = path.resolve(String(file));
    if (!fs.existsSync(resolved)) throw new Error(`Manifest was not found: ${resolved}`);
    files.push(resolved);
  }
  for (const root of Array.isArray(options.roots) ? options.roots : [options.roots].filter(Boolean)) {
    const resolved = path.resolve(String(root));
    if (!fs.existsSync(resolved)) throw new Error(`Manifest root was not found: ${resolved}`);
    walk(resolved, (file) => {
      if (path.basename(file).toLowerCase() === "manifest.json") files.push(file);
    });
  }
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function loadComponents(manifests = []) {
  const components = [];
  for (const manifestFile of manifests) {
    const manifest = readJson(manifestFile);
    for (const component of Array.isArray(manifest.components) ? manifest.components : []) {
      if (!component?.path) continue;
      const signature = normalizeSignature(component);
      components.push({
        provider: component.provider || "",
        path: path.resolve(String(component.path)),
        name: component.name || path.basename(String(component.path)),
        roleTags: Array.isArray(component.roleTags) ? component.roleTags : [],
        manifestFile,
        signature,
        readinessScore: signature.reuseReadinessScore,
        readinessLevel: signature.reuseReadinessLevel
      });
    }
  }
  return components;
}

function scoreCandidateForTask(task = {}, component = {}) {
  const targetMotifs = sanitizeList(task.targetMotifs);
  const sampleMotifs = sanitizeList([
    ...(component.signature.motifs || []),
    component.signature.primaryMotif,
    component.signature.primaryKind
  ]);
  const overlap = targetMotifs.filter((target) => sampleMotifs.some((sample) => motifsCompatible(target, sample)));
  const readiness = normalizeNumber(component.readinessScore, 0);
  let score = 0;
  const reasons = [];
  if (overlap.length > 0) {
    score += Math.min(overlap.length, 3) * 25;
    reasons.push(`motif-overlap:${overlap.join(",")}`);
  } else {
    reasons.push("motif-mismatch-or-missing");
    score = 0;
  }
  if (familyForMotifs(targetMotifs) && familyForMotifs(targetMotifs) === familyForSignature(component.signature)) {
    score += 20;
    reasons.push(`family:${familyForSignature(component.signature)}`);
  }
  if (readiness >= 80) {
    score += 30;
    reasons.push(`high-readiness:${readiness}`);
  } else if (readiness >= 65) {
    score += 10;
    reasons.push(`medium-readiness:${readiness}`);
  } else {
    reasons.push(`low-readiness:${readiness}`);
  }
  if (score > 0 && component.roleTags.includes("applied-component")) score += 8;
  if (!component.signature.primaryKind || sampleMotifs.length === 0) score = 0;
  const ready = score >= 80 && readiness >= 80 && overlap.length > 0;
  return {
    score,
    status: ready ? "ready_candidate" : "weak_candidate",
    reasons,
    component: {
      provider: component.provider,
      path: component.path,
      name: component.name,
      manifestFile: component.manifestFile,
      structure: {
        primaryKind: component.signature.primaryKind,
        primaryMotif: component.signature.primaryMotif,
        motifs: component.signature.motifs,
        reuseReadinessScore: component.signature.reuseReadinessScore,
        reuseReadinessLevel: component.signature.reuseReadinessLevel
      }
    }
  };
}

function normalizeSignature(component = {}) {
  const direct = component.structureSignature || component.learningSummary?.structureSignature || {};
  const catalog = Array.isArray(component.learningSummary?.componentCatalog) ? component.learningSummary.componentCatalog : [];
  const motifs = sanitizeList([
    ...(Array.isArray(direct.motifs) ? direct.motifs : []),
    direct.primaryMotif,
    ...catalog.flatMap((item) => Array.isArray(item?.structure?.motifs) ? item.structure.motifs : [])
  ]);
  const readiness = bestReadiness(catalog);
  return {
    primaryKind: safeText(direct.primaryKind) || safeText(catalog[0]?.structure?.kind),
    primaryMotif: safeText(direct.primaryMotif) || motifs[0] || "",
    motifs,
    reuseReadinessScore: readiness.score,
    reuseReadinessLevel: readiness.level
  };
}

function bestReadiness(catalog = []) {
  let best = { score: 0, level: "" };
  for (const item of catalog) {
    const score = normalizeNumber(item?.reuseReadiness?.score, 0);
    if (score > best.score) best = { score, level: safeText(item?.reuseReadiness?.level) };
  }
  return best;
}

function motifsCompatible(target, sample) {
  if (!target || !sample) return false;
  if (target === sample) return true;
  const aliases = {
    "linear-arrow-chain": new Set(["timeline", "process-chain", "step-flow", "linear-arrow-chain"]),
    "branch-card-flow": new Set(["tree-link", "card-grid", "branch-card-flow"]),
    "lens-funnel-flow": new Set(["funnel", "magnifier", "lens-funnel-flow"]),
    "arc-arrow": new Set(["cycle-loop", "ring-node", "arc-arrow"]),
    "fishbone-cause": new Set(["fishbone-cause-effect", "fishbone-cause"]),
    "venn-overlap": new Set(["venn-overlap", "intersection-overlap"]),
    "intersection-overlap": new Set(["venn-overlap", "intersection-overlap"]),
    "milestone-roadmap": new Set(["timeline", "milestone-roadmap"]),
    "quadrant-axis": new Set(["quadrant-matrix", "quadrant-axis"]),
    "pie-share-chart": new Set(["pie-chart", "pie-share-chart"])
  };
  return aliases[target]?.has(sample) === true || aliases[sample]?.has(target) === true;
}

function familyForSignature(signature = {}) {
  return signature.primaryKind || familyForMotifs(signature.motifs);
}

function familyForMotifs(motifs = []) {
  const set = new Set(sanitizeList(motifs));
  if (set.has("arc-arrow") || set.has("ring-node")) return "cycle-loop";
  if (set.has("fishbone-cause")) return "fishbone-cause-effect";
  if (set.has("venn-overlap") || set.has("intersection-overlap")) return "venn-overlap";
  if (set.has("milestone-roadmap")) return "timeline";
  if (set.has("quadrant-axis")) return "quadrant-matrix";
  if (set.has("layered-stack") || set.has("funnel-stack") || set.has("pyramid-stack")) return "layered-stack";
  if (set.has("pie-share-chart")) return "pie-chart";
  if (set.has("linear-arrow-chain") || set.has("branch-card-flow") || set.has("lens-funnel-flow")) return "process-chain";
  if (set.has("tree-link") || set.has("radial-link")) return "network-diagram";
  if (set.has("card-grid")) return "relationship-diagram";
  return "";
}

function walk(root, visit) {
  const stack = [path.resolve(root)];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) visit(file);
    }
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function sanitizeList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => safeText(value).replace(/_/g, "-"))
    .filter(Boolean))];
}

function safeText(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().toLowerCase();
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = rankHarvestCandidates(args);
    console.log(JSON.stringify({
      summary: report.summary,
      out: args.out ? path.resolve(args.out) : null,
      tasks: report.tasks.map((task) => ({
        componentId: task.componentId,
        bestStatus: task.bestStatus,
        bestScore: task.candidates[0]?.score || 0,
        bestName: task.candidates[0]?.component?.name || null,
        reasons: task.candidates[0]?.reasons || []
      }))
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  discoverManifestFiles,
  loadComponents,
  parseArgs,
  rankHarvestCandidates,
  scoreCandidateForTask
};
