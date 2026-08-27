"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    gapReport: "",
    applySession: "",
    out: "",
    markdownOut: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--gap-report" || arg === "--report") && next) {
      args.gapReport = next;
      index += 1;
    } else if ((arg === "--apply-session" || arg === "--plugin-apply-session") && next) {
      args.applySession = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      index += 1;
    } else {
      throw new Error(`Unknown component-replacement-harvest-queue argument: ${arg}`);
    }
  }
  if (!args.gapReport && !args.applySession) throw new Error("--gap-report or --apply-session is required.");
  return args;
}

function buildComponentReplacementHarvestQueue(options = {}) {
  const source = readQueueSource(options);
  const tasks = source.kind === "apply-session"
    ? normalizeApplySessionTasks(source.payload)
    : normalizeGapTasks(source.payload);
  const queue = {
    provider: "component-replacement-harvest-queue-v1",
    createdAt: new Date().toISOString(),
    sourceKind: source.kind,
    gapReport: source.kind === "gap-report" ? source.file : "",
    applySession: source.kind === "apply-session" ? source.file : "",
    summary: {
      taskCount: tasks.length,
      affectedFiles: unique(tasks.flatMap((task) => task.affectedFiles.map((file) => file.inputPptx))).length,
      totalAnchorCount: tasks.reduce((sum, task) => sum + task.totalAnchorCount, 0),
      totalAffectedTargets: tasks.reduce((sum, task) => sum + safeArray(task.affectedTargets).length, 0),
      readyToApplyAfterHarvest: tasks.length === 0
    },
    tasks
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }
  if (options.markdownOut) {
    const markdownOut = path.resolve(String(options.markdownOut));
    fs.mkdirSync(path.dirname(markdownOut), { recursive: true });
    fs.writeFileSync(markdownOut, renderHarvestQueueMarkdown(queue), "utf8");
  }
  return queue;
}

function readQueueSource(options = {}) {
  if (options.applySession) {
    const file = path.resolve(String(options.applySession || ""));
    if (!fs.existsSync(file)) throw new Error(`Apply-session report was not found: ${file}`);
    return {
      kind: "apply-session",
      file,
      payload: readJson(file)
    };
  }
  const file = path.resolve(String(options.gapReport || ""));
  if (!fs.existsSync(file)) throw new Error(`Gap report was not found: ${file}`);
  return {
    kind: "gap-report",
    file,
    payload: readJson(file)
  };
}

function normalizeGapTasks(gapReport) {
  const gaps = Array.isArray(gapReport?.gaps) ? gapReport.gaps : [];
  return gaps.map((gap, index) => {
    const provider = safeText(gap.provider || gap.nextAction?.requiredSample?.provider || "plugin");
    const componentId = safeText(gap.componentId || gap.nextAction?.requiredSample?.componentId || `component-${index + 1}`);
    const kind = safeText(gap.kind || gap.nextAction?.requiredSample?.kind || "component");
    const affectedFiles = Array.isArray(gap.affectedFiles) ? gap.affectedFiles : [];
    return {
      id: `${provider}:${kind}:${componentId}`,
      status: "needs_harvest",
      priority: index + 1,
      provider,
      kind,
      componentId,
      title: safeText(gap.title || gap.nextAction?.requiredSample?.title || ""),
      targetMotifs: sanitizeStringArray(gap.targetMotifs || gap.nextAction?.requiredSample?.targetMotifs),
      searchKeywords: sanitizeStringArray(gap.searchKeywords || gap.nextAction?.requiredSample?.searchKeywords),
      tier: gap.tier || null,
      maxScore: Number.isFinite(Number(gap.maxScore)) ? Number(gap.maxScore) : null,
      affectedFileCount: Number(gap.affectedFileCount || affectedFiles.length || 0),
      totalAnchorCount: Number(gap.totalAnchorCount || 0),
      harvestCommand: gap.nextAction?.harvestCommand || defaultHarvestCommand(provider, componentId),
      workflow: Array.isArray(gap.nextAction?.workflow) ? gap.nextAction.workflow : defaultWorkflow(provider),
      affectedFiles: affectedFiles.map((file) => ({
        inputPptx: file.inputPptx || null,
        groupKey: file.groupKey || null,
        layer: file.layer || null,
        anchorCount: Number(file.anchorCount || 0),
        slides: file.slides || []
      }))
    };
  });
}

function normalizeApplySessionTasks(report = {}) {
  const actions = Array.isArray(report.actions) ? report.actions : [];
  return actions.map((action, index) => {
    const provider = safeText(action.provider || "plugin");
    const componentId = safeText(action.id || `component-${index + 1}`);
    const kind = safeText(action.kind || "component");
    const affectedTargets = sanitizeAffectedTargets(action.affectedTargets);
    const affectedSlides = sanitizeAffectedSlides(action.affectedSlides);
    const targetMotifs = sanitizeStringArray(action.targetMotifs);
    const searchKeywords = sanitizeStringArray([
      action.searchText,
      action.action?.searchText,
      action.title,
      componentId
    ]);
    return {
      id: `${provider}:${kind}:${componentId}:${targetMotifs.join(",") || "generic"}:${index + 1}`,
      status: "needs_harvest",
      source: "plugin-apply-session",
      priority: Number(action.order || index + 1),
      provider,
      kind,
      componentId,
      title: safeText(action.title || ""),
      targetMotifs,
      searchKeywords,
      tier: action.suitability?.tier || null,
      maxScore: Number.isFinite(Number(action.suitability?.score)) ? Number(action.suitability.score) : null,
      affectedFileCount: 0,
      totalAnchorCount: affectedTargets.length,
      totalAffectedTargets: affectedTargets.length,
      harvestCommand: defaultHarvestCommand(provider, componentId),
      workflow: defaultApplySessionWorkflow(action),
      affectedFiles: [],
      affectedTargets,
      affectedSlides
    };
  });
}

function renderHarvestQueueMarkdown(queue) {
  const lines = [
    "# Component Replacement Harvest Queue",
    "",
    `Generated: ${queue.createdAt}`,
    `Source: ${queue.sourceKind || "gap-report"}`,
    `Tasks: ${queue.summary.taskCount}`,
    `Affected files: ${queue.summary.affectedFiles}`,
    `Total anchors: ${queue.summary.totalAnchorCount}`,
    `Affected targets: ${queue.summary.totalAffectedTargets || 0}`,
    ""
  ];
  if (queue.tasks.length === 0) {
    lines.push("No missing component samples. The replacement batch can apply all known component groups.");
    lines.push("");
    return lines.join("\n");
  }
  for (const task of queue.tasks) {
    lines.push(`## ${task.priority}. ${task.provider} ${task.kind} ${task.componentId}`);
    lines.push("");
    lines.push(`- Status: ${task.status}`);
    if (task.title) lines.push(`- Title: ${task.title}`);
    if (task.searchKeywords.length > 0) lines.push(`- Search keywords: ${task.searchKeywords.join(" / ")}`);
    if (task.targetMotifs.length > 0) lines.push(`- Target motifs: ${task.targetMotifs.join(", ")}`);
    lines.push(`- Affected files: ${task.affectedFileCount}`);
    lines.push(`- Anchors: ${task.totalAnchorCount}`);
    if (task.tier) lines.push(`- Suitability: ${task.tier}${task.maxScore !== null ? ` / ${task.maxScore}` : ""}`);
    lines.push("");
    lines.push("```powershell");
    lines.push(task.harvestCommand);
    lines.push("```");
    lines.push("");
    lines.push("Workflow:");
    for (const step of task.workflow) lines.push(`- ${step}`);
    lines.push("");
    lines.push("Affected groups:");
    for (const file of safeArray(task.affectedFiles).slice(0, 20)) {
      lines.push(`- ${file.inputPptx || "(unknown file)"} | ${file.groupKey || "(unknown group)"} | anchors=${file.anchorCount} | slides=${(file.slides || []).join(",")}`);
    }
    if (safeArray(task.affectedFiles).length > 20) lines.push(`- ... ${task.affectedFiles.length - 20} more`);
    if (safeArray(task.affectedTargets).length > 0) {
      lines.push("");
      lines.push("Affected targets:");
      for (const target of task.affectedTargets.slice(0, 20)) {
        lines.push(`- ${target.deck || "(unknown deck)"} p${target.slide || "?"} | ${target.imageId || "(unknown image)"} | ${target.layerKey || "(unknown layer)"}`);
      }
      if (task.affectedTargets.length > 20) lines.push(`- ... ${task.affectedTargets.length - 20} more`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function defaultApplySessionWorkflow(action = {}) {
  const provider = safeText(action.provider || "plugin");
  const searchText = safeText(action.searchText || action.action?.searchText || action.title || action.id);
  return [
    searchText ? `Open ${provider} and search: ${searchText}.` : `Open ${provider} and find the matching component.`,
    `Apply/download ${safeText(action.id || action.title || "component")} into a blank active slide.`,
    "Keep only the applied component selected when possible, or keep it on an otherwise blank slide.",
    "Run the harvest command, refresh the component inventory, then rerun component replacement."
  ];
}

function sanitizeAffectedTargets(values = []) {
  return safeArray(values)
    .map((item) => {
      const source = item && typeof item === "object" ? item : {};
      return {
        deck: safeText(source.deck),
        slide: Number.isFinite(Number(source.slide)) ? Math.trunc(Number(source.slide)) : null,
        imageId: safeText(source.imageId),
        imageIndex: Number.isFinite(Number(source.imageIndex)) ? Math.trunc(Number(source.imageIndex)) : null,
        layerKey: safeText(source.layerKey)
      };
    })
    .filter((item) => item.deck || item.slide !== null || item.imageId || item.layerKey)
    .slice(0, 500);
}

function sanitizeAffectedSlides(values = []) {
  return safeArray(values)
    .map((item) => {
      const source = item && typeof item === "object" ? item : {};
      return {
        deck: safeText(source.deck),
        slide: Number.isFinite(Number(source.slide)) ? Math.trunc(Number(source.slide)) : null
      };
    })
    .filter((item) => item.deck || item.slide !== null)
    .slice(0, 500);
}

function defaultHarvestCommand(provider, componentId) {
  return `node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider ${sanitizeCliToken(provider)} --label ${sanitizeCliToken(componentId)}`;
}

function defaultWorkflow(provider) {
  return [
    `Open the matching ${provider} component in PowerPoint and apply/download it into the active slide.`,
    "Keep only the applied component selected when possible, or keep it on an otherwise blank slide.",
    "Run the harvest command, refresh the component inventory, then rerun component replacement."
  ];
}

function sanitizeStringArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeText(value))
    .filter(Boolean)
    .slice(0, 12);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeCliToken(value) {
  return String(value || "component")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "component";
}

function safeText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .trim()
    .slice(0, 160);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const queue = buildComponentReplacementHarvestQueue(args);
    console.log(JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildComponentReplacementHarvestQueue,
  normalizeApplySessionTasks,
  normalizeGapTasks,
  parseArgs,
  renderHarvestQueueMarkdown
};
