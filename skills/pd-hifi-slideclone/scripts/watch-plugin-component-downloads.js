"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  harvestAppliedPptComponents,
  officePlusDiscoveryRoots
} = require("./harvest-applied-ppt-components");
const {
  powerPointComBootstrapScript
} = require("./harvest-active-powerpoint-component");

const SUPPORTED_EXTENSIONS = new Set([".pptx", ".potx", ".ppt"]);

function parseArgs(argv) {
  const args = {
    out: path.join("runs", "plugin-component-inventory", "watched-plugin-components"),
    provider: "all",
    roots: [],
    files: [],
    durationMs: 30000,
    pollMs: 1000,
    maxFiles: 50,
    includeDefaultRoots: true,
    activePowerPoint: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--provider" && next) {
      args.provider = next;
      i += 1;
    } else if (arg === "--root" && next) {
      args.roots.push(next);
      i += 1;
    } else if ((arg === "--file" || arg === "--source") && next) {
      args.files.push(next);
      i += 1;
    } else if (arg === "--duration-ms" && next) {
      args.durationMs = Number(next);
      i += 1;
    } else if (arg === "--poll-ms" && next) {
      args.pollMs = Number(next);
      i += 1;
    } else if (arg === "--max-files" && next) {
      args.maxFiles = Number(next);
      i += 1;
    } else if (arg === "--no-default-roots") {
      args.includeDefaultRoots = false;
    } else if (arg === "--active-powerpoint" || arg === "--active-ppt") {
      args.activePowerPoint = true;
    } else {
      throw new Error(`Unknown watch-plugin-component-downloads argument: ${arg}`);
    }
  }
  args.provider = normalizeProvider(args.provider);
  args.durationMs = clampInteger(args.durationMs, 0, 10 * 60 * 1000, 30000);
  args.pollMs = clampInteger(args.pollMs, 100, 60000, 1000);
  args.maxFiles = clampInteger(args.maxFiles, 1, 1000, 50);
  args.activePowerPoint = args.activePowerPoint === true;
  return args;
}

async function watchPluginComponentDownloads(options = {}) {
  const args = { ...parseArgs(["node", "watch-plugin-component-downloads.js"]), ...options };
  args.provider = normalizeProvider(args.provider);
  args.durationMs = clampInteger(args.durationMs, 0, 10 * 60 * 1000, 30000);
  args.pollMs = clampInteger(args.pollMs, 100, 60000, 1000);
  args.maxFiles = clampInteger(args.maxFiles, 1, 1000, 50);
  args.activePowerPoint = args.activePowerPoint === true;
  const activePowerPointFile = args.activePowerPoint
    ? resolveActivePowerPointFile({ runner: options.runner })
    : { path: "", error: "" };
  if (activePowerPointFile.path) args.files = uniquePaths([...(Array.isArray(args.files) ? args.files : [args.files]), activePowerPointFile.path]);
  const roots = resolveWatchRoots(args);
  const before = snapshotRoots(roots);
  const startTime = Date.now();
  const deadline = startTime + args.durationMs;
  while (Date.now() < deadline) {
    await sleep(Math.min(args.pollMs, Math.max(0, deadline - Date.now())));
  }
  const after = snapshotRoots(roots);
  const changed = diffSnapshots(before, after)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)
    .slice(0, args.maxFiles);
  // Plugins can leave a short-lived download stub or write the same package to
  // overlapping iSlide/OfficePLUS caches. Keep both facts in the report, but
  // only harvest complete packages once so the reusable asset corpus stays clean.
  const screened = screenChangedComponentFiles(changed);
  const grouped = groupFilesByProvider(screened.accepted);
  const harvests = [];
  for (const [provider, files] of Object.entries(grouped)) {
    if (files.length === 0) continue;
    const out = path.join(path.resolve(String(args.out)), provider);
    const manifest = harvestAppliedPptComponents({
      sources: files.map((file) => file.path),
      out,
      provider,
      maxFiles: args.maxFiles
    });
    harvests.push({
      provider,
      outRoot: out,
      manifest
    });
  }
  return {
    provider: "plugin-component-download-watch-v1",
    startedAt: new Date(startTime).toISOString(),
    durationMs: args.durationMs,
    activePowerPointFile,
    roots,
    changedCount: changed.length,
    eligibleCount: screened.accepted.length,
    changedFiles: changed.map((file) => ({
      provider: file.provider,
      path: file.path,
      sizeBytes: file.size,
      modifiedAt: new Date(file.mtimeMs).toISOString()
    })),
    ignoredFiles: screened.ignored,
    harvests: harvests.map((harvest) => ({
      provider: harvest.provider,
      outRoot: harvest.outRoot,
      copiedCount: harvest.manifest.copiedCount,
      componentNames: harvest.manifest.components.map((component) => component.name)
    }))
  };
}

function resolveWatchRoots(options = {}) {
  const provider = normalizeProvider(options.provider || "all");
  const roots = [];
  if (options.includeDefaultRoots !== false) {
    if (provider === "all" || provider === "islide") roots.push(...iSlideWatchRoots());
    if (provider === "all" || provider === "officeplus") roots.push(...officePlusDiscoveryRoots());
  }
  roots.push(...(Array.isArray(options.roots) ? options.roots : [options.roots]).filter(Boolean));
  roots.push(...(Array.isArray(options.files) ? options.files : [options.files]).filter(Boolean));
  return uniquePaths(roots).filter((root) => fs.existsSync(root));
}

function iSlideWatchRoots() {
  return [
    path.join(os.tmpdir(), "iSlide Tools", "site", "content", "file")
  ];
}

function snapshotRoots(roots = []) {
  const entries = new Map();
  for (const root of roots) {
    try {
      const stat = fs.statSync(root);
      if (stat.isFile()) {
        addSnapshotFile(entries, root, root);
        continue;
      }
    } catch {
      continue;
    }
    walk(root, {
      maxDepth: 8,
      visit(file) {
        addSnapshotFile(entries, file, root);
      }
    });
  }
  return entries;
}

function addSnapshotFile(entries, file, root) {
  if (!SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase())) return;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return;
    entries.set(path.resolve(file).toLowerCase(), {
      path: path.resolve(file),
      root,
      provider: inferProviderForPath(file),
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
  } catch {
    // Ignore files still being written by plugins.
  }
}

function diffSnapshots(before, after) {
  const changed = [];
  for (const [key, next] of after.entries()) {
    const prev = before.get(key);
    if (!prev || prev.size !== next.size || Math.abs(prev.mtimeMs - next.mtimeMs) > 1) changed.push(next);
  }
  return changed;
}

function groupFilesByProvider(files = []) {
  const grouped = { islide: [], officeplus: [] };
  for (const file of files) {
    const provider = file.provider === "officeplus" ? "officeplus" : "islide";
    grouped[provider].push(file);
  }
  return grouped;
}

function screenChangedComponentFiles(files = []) {
  const accepted = [];
  const ignored = [];
  const hashes = new Map();
  for (const file of files) {
    const validation = validateHarvestableComponentFile(file.path);
    if (!validation.ok) {
      ignored.push({
        provider: file.provider,
        path: file.path,
        sizeBytes: file.size,
        reason: validation.reason
      });
      continue;
    }
    const existing = hashes.get(validation.sha256);
    if (existing) {
      ignored.push({
        provider: file.provider,
        path: file.path,
        sizeBytes: file.size,
        reason: "duplicate-content",
        duplicateOf: existing.path
      });
      continue;
    }
    hashes.set(validation.sha256, file);
    accepted.push(file);
  }
  return { accepted, ignored };
}

function validateHarvestableComponentFile(file) {
  const ext = path.extname(String(file || "")).toLowerCase();
  // Legacy binary PPT files are intentionally allowed through; only the XML
  // package extensions have a cheap, deterministic completion marker.
  if (ext === ".ppt") return { ok: true, sha256: hashFile(file) };
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return { ok: false, reason: "empty-file" };
    if (!hasZipEndOfCentralDirectory(file, stat.size)) return { ok: false, reason: "incomplete-openxml-package" };
    return { ok: true, sha256: hashFile(file) };
  } catch {
    return { ok: false, reason: "unreadable-file" };
  }
}

function hasZipEndOfCentralDirectory(file, sizeBytes) {
  const maxCommentBytes = 0xffff;
  const bytesToRead = Math.min(sizeBytes, maxCommentBytes + 22);
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(handle, buffer, 0, bytesToRead, sizeBytes - bytesToRead);
    // ZIP end-of-central-directory signature, searched from the tail because
    // a package may contain arbitrary binary data before it.
    return buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;
  } finally {
    fs.closeSync(handle);
  }
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function inferProviderForPath(file) {
  const text = String(file || "").toLowerCase();
  if (/officeplus|oppowerpntaddin/.test(text)) return "officeplus";
  return "islide";
}

function resolveActivePowerPointFile(options = {}) {
  const runner = typeof options.runner === "function" ? options.runner : runPowerShell;
  const script = `${powerPointComBootstrapScript()}
$ErrorActionPreference = 'Stop'
$payload = [ordered]@{ path = ''; error = '' }
try {
  $ppt = Get-SlideclonePowerPointApplication
  if ($null -eq $ppt -or $ppt.Presentations.Count -lt 1) {
    throw 'No active PowerPoint presentation is open.'
  }
  $presentation = $ppt.ActivePresentation
  if ($null -eq $presentation) {
    $presentation = $ppt.Presentations.Item(1)
  }
  $file = [string]$presentation.FullName
  if ([string]::IsNullOrWhiteSpace($file)) {
    throw 'The active PowerPoint presentation must be saved before it can be watched.'
  }
  $payload.path = $file
} catch {
  $payload.error = 'No running PowerPoint application was found.'
}
$payload | ConvertTo-Json -Compress
`;
  const completed = runner({ script });
  const stdout = String(completed.stdout || "").trim();
  const stderr = String(completed.stderr || "").trim();
  if (completed.status !== 0) {
    return { path: "", error: redactLogText(stderr || stdout || `PowerPoint query failed (${completed.status})`) };
  }
  try {
    const payload = stdout ? JSON.parse(stdout) : {};
    const file = safeExistingPresentationPath(payload?.path);
    return {
      path: file,
      error: file ? "" : redactLogText(payload?.error || "No saved active PowerPoint presentation was found.")
    };
  } catch {
    return { path: "", error: redactLogText(stdout.slice(0, 300) || "PowerPoint query returned invalid JSON.") };
  }
}

function safeExistingPresentationPath(value) {
  const file = path.resolve(String(value || ""));
  if (!file || !SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase())) return "";
  return fs.existsSync(file) ? file : "";
}

function runPowerShell({ script }) {
  return spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

function redactLogText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|api[-_ ]?key|secret|cookie)=([^\s;&]+)/gi, "$1=[redacted]");
}

function walk(dir, context, depth = 0) {
  if (depth > context.maxDepth) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, context, depth + 1);
    else if (entry.isFile()) context.visit(full);
  }
}

function normalizeProvider(value) {
  const provider = String(value || "all").trim().toLowerCase();
  return /^(all|islide|officeplus)$/.test(provider) ? provider : "all";
}

function uniquePaths(paths = []) {
  const seen = new Set();
  const result = [];
  for (const item of paths) {
    const full = path.resolve(String(item || ""));
    const key = full.toLowerCase();
    if (!full || seen.has(key)) continue;
    seen.add(key);
    result.push(full);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await watchPluginComponentDownloads(args);
  fs.mkdirSync(path.resolve(args.out), { recursive: true });
  const reportFile = path.join(path.resolve(args.out), "watch-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`changed plugin component files: ${report.changedCount}`);
  for (const harvest of report.harvests) console.log(`- ${harvest.provider}: ${harvest.copiedCount}`);
  console.log(`report: ${reportFile}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  diffSnapshots,
  inferProviderForPath,
  parseArgs,
  resolveActivePowerPointFile,
  resolveWatchRoots,
  screenChangedComponentFiles,
  addSnapshotFile,
  snapshotRoots,
  watchPluginComponentDownloads
};
