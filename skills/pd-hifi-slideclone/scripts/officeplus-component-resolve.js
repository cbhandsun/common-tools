"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  getOfficePlusDownloadUrl,
  searchOfficePlusComponents
} = require("./lib/officeplus-search");

function parseArgs(argv) {
  const args = {
    targets: [],
    out: path.join("runs", "plugin-component-inventory", "officeplus-component-resolve.json"),
    size: 6,
    maxDownloadUrls: 4,
    resolveDownloads: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--target" || arg === "--component" || arg === "--id") && next) {
      args.targets.push(parseTarget(next));
      index += 1;
    } else if (arg === "--targets" && next) {
      args.targets.push(...String(next).split(",").map(parseTarget));
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      index += 1;
    } else if (arg === "--max-download-urls" && next) {
      args.maxDownloadUrls = Number(next);
      index += 1;
    } else if (arg === "--no-download-lookup") {
      args.resolveDownloads = false;
    } else {
      throw new Error(`Unknown officeplus-component-resolve argument: ${arg}`);
    }
  }
  args.targets = args.targets.filter((target) => target.id || target.keywords);
  if (args.targets.length === 0) throw new Error("--target is required.");
  return args;
}

function parseTarget(value) {
  const text = safeString(value);
  const [idPart, ...keywordParts] = text.split("=");
  if (/^[A-Za-z]+Content-\d+$/.test(idPart) && keywordParts.length > 0) {
    return { id: idPart, keywords: keywordParts.join("=") };
  }
  if (/^[A-Za-z]+Content-\d+$/.test(text)) return { id: text, keywords: text };
  return { id: "", keywords: text };
}

async function resolveOfficePlusComponents(options = {}) {
  const targets = (Array.isArray(options.targets) ? options.targets : [])
    .map((target) => typeof target === "string" ? parseTarget(target) : normalizeTarget(target))
    .filter((target) => target.id || target.keywords);
  const size = normalizePositiveInt(options.size, 6);
  const maxDownloadUrls = normalizePositiveInt(options.maxDownloadUrls, 4);
  const fetchImpl = options.fetchImpl;
  const rows = [];
  for (const target of targets) {
    const search = await resolveSearchTarget({ target, size, fetchImpl });
    const best = chooseBestDocument(search.documents, target);
    const downloadLookup = options.resolveDownloads === false || !best?.id
      ? null
      : await probeDownloadUrl(best.id, {
        kind: best.kind || "component",
        fetchImpl,
        maxDownloadUrls
      });
    rows.push({
      target,
      search: {
        status: search.status,
        total: search.total,
        error: search.error || "",
        query: search.query || null
      },
      bestDocument: best ? summarizeDocument(best) : null,
      downloadLookup,
      acquisitionMode: classifyAcquisitionMode({ best, downloadLookup })
    });
  }
  return {
    provider: "officeplus-component-resolve-v1",
    generatedAt: new Date().toISOString(),
    summary: summarizeRows(rows),
    rows
  };
}

async function resolveSearchTarget({ target, size, fetchImpl }) {
  const keywords = target.keywords || target.id;
  try {
    const result = await searchOfficePlusComponents({
      kind: "component",
      keywords,
      size,
      fetchImpl
    });
    return {
      status: "ok",
      total: result.total,
      query: result.query,
      documents: result.documents
    };
  } catch (error) {
    return {
      status: "error",
      total: 0,
      error: safeError(error),
      documents: []
    };
  }
}

function chooseBestDocument(documents = [], target = {}) {
  const id = safeString(target.id).toLowerCase();
  if (id) {
    const exact = documents.find((document) => safeString(document.id).toLowerCase() === id);
    if (exact) return exact;
  }
  return documents[0] || null;
}

async function probeDownloadUrl(id, options = {}) {
  const attempts = [];
  for (const anonymous of [false, true]) {
    try {
      const result = await getOfficePlusDownloadUrl(id, {
        kind: options.kind || "component",
        anonymous,
        fetchImpl: options.fetchImpl
      });
      attempts.push({
        anonymous,
        status: result.downloadUrl ? "ok" : "empty",
        endpoint: result.endpoint,
        downloadUrl: result.downloadUrl
      });
      if (result.downloadUrl) break;
    } catch (error) {
      attempts.push({
        anonymous,
        status: "error",
        httpStatus: error.status || null,
        errorCode: error.payload?.error_code || null,
        endpoint: error.payload?.endpoint || "",
        message: safeError(error)
      });
    }
    if (attempts.length >= normalizePositiveInt(options.maxDownloadUrls, 4)) break;
  }
  return {
    provider: "officeplus-download-probe-v1",
    id,
    attempts,
    status: attempts.some((attempt) => attempt.status === "ok")
      ? "ok"
      : attempts.some((attempt) => attempt.httpStatus === 401 || attempt.errorCode === 401001)
        ? "auth-required"
        : "unresolved",
    downloadUrl: attempts.find((attempt) => attempt.downloadUrl)?.downloadUrl || ""
  };
}

function classifyAcquisitionMode({ best = null, downloadLookup = null } = {}) {
  if (!best) return "missing";
  if (downloadLookup?.status === "ok") return "direct-download";
  if (downloadLookup?.status === "auth-required") return "plugin-auth-required";
  if (Number(best.price || 0) > 0 || best.paymentType !== 0) return "plugin-or-member-required";
  return "plugin-apply-required";
}

function summarizeRows(rows = []) {
  const summary = {
    targets: rows.length,
    found: rows.filter((row) => row.bestDocument).length,
    directDownload: rows.filter((row) => row.acquisitionMode === "direct-download").length,
    authRequired: rows.filter((row) => row.acquisitionMode === "plugin-auth-required").length,
    byAcquisitionMode: {}
  };
  for (const row of rows) {
    const key = row.acquisitionMode || "unknown";
    summary.byAcquisitionMode[key] = (summary.byAcquisitionMode[key] || 0) + 1;
  }
  return summary;
}

function summarizeDocument(document = {}) {
  return {
    id: safeString(document.id),
    kind: safeString(document.kind),
    title: safeString(document.title),
    fileName: safeString(document.fileName),
    fileSize: document.fileSize ?? null,
    itemCount: document.itemCount ?? null,
    paymentType: document.paymentType ?? null,
    price: document.price ?? null,
    coverUrl: safeString(document.coverUrl),
    reuseHint: safeString(document.reuseHint),
    tags: Array.isArray(document.tags) ? document.tags.slice(0, 16) : []
  };
}

function normalizeTarget(value = {}) {
  return {
    id: safeString(value.id),
    keywords: safeString(value.keywords || value.title || value.id)
  };
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safeError(error) {
  return String(error?.message || error || "").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").slice(0, 300);
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await resolveOfficePlusComponents(args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`OfficePLUS component targets: ${report.summary.found}/${report.summary.targets}`);
  console.log(`direct downloads: ${report.summary.directDownload}`);
  console.log(`auth required: ${report.summary.authRequired}`);
  console.log(`report: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  classifyAcquisitionMode,
  parseArgs,
  parseTarget,
  probeDownloadUrl,
  resolveOfficePlusComponents,
  summarizeRows,
  _private: {
    chooseBestDocument,
    summarizeDocument
  }
};
