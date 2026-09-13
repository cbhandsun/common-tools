"use strict";

const path = require("node:path");

function parseArgs(argv) {
  const args = {
    search: "",
    coverageMatrix: "",
    repairCoverage: "",
    motifRecall: "",
    harvestShortlist: "",
    targetAudit: "",
    officePlusResolve: "",
    out: path.join("runs", "plugin-component-inventory", "component-plugin-action-queue.json"),
    markdownOut: "",
    maxActions: 10,
    minScore: 50,
    minSuitability: 35
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--search" || arg === "--in") && next) {
      args.search = next;
      i += 1;
    } else if ((arg === "--coverage-matrix" || arg === "--coverage") && next) {
      args.coverageMatrix = next;
      i += 1;
    } else if ((arg === "--repair-coverage" || arg === "--expression-policy-coverage") && next) {
      args.repairCoverage = next;
      i += 1;
    } else if ((arg === "--motif-recall" || arg === "--recall") && next) {
      args.motifRecall = next;
      i += 1;
    } else if ((arg === "--harvest-shortlist" || arg === "--shortlist") && next) {
      args.harvestShortlist = next;
      i += 1;
    } else if ((arg === "--target-audit" || arg === "--plugin-target-audit") && next) {
      args.targetAudit = next;
      i += 1;
    } else if ((arg === "--officeplus-resolve" || arg === "--resolve") && next) {
      args.officePlusResolve = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      i += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      i += 1;
    } else if (arg === "--min-score" && next) {
      args.minScore = Number(next);
      i += 1;
    } else if (arg === "--min-suitability" && next) {
      args.minSuitability = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown component-plugin-action-queue argument: ${arg}`);
    }
  }
  if (!args.search && !args.coverageMatrix && !args.repairCoverage && !args.motifRecall && !args.harvestShortlist && !args.targetAudit) {
    throw new Error("--search, --coverage-matrix, --repair-coverage, --motif-recall, --harvest-shortlist, or --target-audit is required");
  }
  return args;
}

function renderPluginActionQueueMarkdown(queue = {}) {
  const lines = [
    "# Plugin Component Action Queue",
    "",
    `Generated: ${safeString(queue.generatedAt || new Date().toISOString())}`,
    `Actions: ${Number(queue.summary?.actions || 0)}`,
    "",
    "Run this watcher before applying plugin components so downloaded/applied PPTX components are harvested automatically:",
    "",
    "```powershell",
    "node packages\\slideclone-native-engine\\scripts\\watch-plugin-component-downloads.js --provider all --active-powerpoint --duration-ms 30000 --poll-ms 500 --out runs\\plugin-component-inventory\\watched-plugin-components",
    "```",
    ""
  ];
  const actions = Array.isArray(queue.actions) ? queue.actions : [];
  if (actions.length === 0) {
    lines.push("No plugin actions are currently queued.");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }
  for (const action of actions) {
    const order = Number(action.order || 0) || actions.indexOf(action) + 1;
    const motif = (action.targetMotifs || []).join(", ") || "unknown";
    lines.push(`## ${order}. ${safeString(action.action?.tab || action.provider)} ${safeString(action.kind)} for ${motif}`);
    lines.push("");
    lines.push(`- Priority: ${safeString(action.suitability?.tier || "unknown")} / ${Number(action.suitability?.score || action.score || 0)}`);
    lines.push(`- Search: ${safeString(action.action?.searchText || action.matchedKeywords)}`);
    lines.push(`- Keywords: ${sanitizeStringArray(action.searchKeywords).join(" | ")}`);
    lines.push(`- Plugin: ${safeString(action.action?.tab || action.provider)}`);
    lines.push(`- Library: ${safeString(action.action?.library || action.kind)}`);
    if (action.acquisitionMode) lines.push(`- Acquisition mode: ${safeString(action.acquisitionMode)}`);
    if (action.fileName) lines.push(`- Source file: ${safeString(action.fileName)}`);
    if (action.paymentType !== null && action.paymentType !== undefined) lines.push(`- Payment type: ${safeString(action.paymentType)}`);
    if (action.price !== null && action.price !== undefined) lines.push(`- Price: ${safeString(action.price)}`);
    if (action.downloadLookup?.status) lines.push(`- Download lookup: ${safeString(action.downloadLookup.status)}`);
    if (action.acquisitionReason) lines.push(`- Reason: ${safeString(action.acquisitionReason)}`);
    lines.push("");
    lines.push("Instruction:");
    lines.push(safeString(action.action?.instruction || "Search and apply the matching plugin component into the active PowerPoint slide."));
    lines.push("");
    lines.push("After applying this component, refresh the component inventory:");
    lines.push("");
    lines.push("```powershell");
    lines.push("node packages\\slideclone-native-engine\\scripts\\component-library-refresh.js --learn-structure --watch-plugin-downloads --watch-provider all --watch-duration-ms 30000 --watch-poll-ms 500");
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function safeString(value) {
  return Array.from(String(value ?? ""))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
}

function sanitizeStringArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value))
    .filter(Boolean))];
}

module.exports = {
  parseArgs,
  renderPluginActionQueueMarkdown
};
