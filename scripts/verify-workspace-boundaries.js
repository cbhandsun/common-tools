"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { isBuiltin } = require("node:module");
const { Linter } = require("eslint");

// Parse imports without loading or executing repository modules. ESLint is a
// declared build dependency; this verifier is never part of the host Runtime.
function collectImports(source, filename = "source.js") {
  if (typeof source !== "string" || Buffer.byteLength(source) > 4 * 1024 * 1024) throw new TypeError("boundary source must be bounded text");
  const imports = [];
  const record = (node, expression) => imports.push({
    specifier: expression?.type === "Literal" && typeof expression.value === "string" ? expression.value : null,
    line: node.loc.start.line
  });
  const messages = new Linter().verify(source, {
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    plugins: { boundary: { rules: { imports: { create() {
      return {
        ImportDeclaration(node) { record(node, node.source); },
        ExportNamedDeclaration(node) { if (node.source) record(node, node.source); },
        ExportAllDeclaration(node) { record(node, node.source); },
        ImportExpression(node) { record(node, node.source); },
        CallExpression(node) {
          if (node.callee.type === "Identifier" && node.callee.name === "require") record(node, node.arguments.length === 1 ? node.arguments[0] : null);
        }
      };
    } } } } },
    rules: { "boundary/imports": "error" }
  }, { filename });
  if (messages.some((message) => message.fatal)) throw new Error("boundary source cannot be parsed");
  return imports;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (["node_modules", "obj"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("workspace sources must not contain symbolic links");
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) files.push(file);
  }
  return files;
}

function packageName(specifier) {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
}

function forbiddenLayer(source, target) {
  const transports = new Set(["cli", "mcp-server", "remote-mcp-server"]);
  if (source === "capability-contracts" || source === "capability-manifests") return true;
  if (source === "capability-runtime") return !["capability-contracts", "capability-manifests"].includes(target);
  if (source === "team-runtime") return !["capability-contracts", "capability-runtime", "capability-manifests"].includes(target);
  return !transports.has(source) && transports.has(target);
}

function findCycles(graph) {
  const done = new Set(); const active = new Set(); const stack = []; const cycles = [];
  function visit(name) {
    if (active.has(name)) { cycles.push([...stack.slice(stack.indexOf(name)), name]); return; }
    if (done.has(name)) return;
    active.add(name); stack.push(name);
    for (const target of [...(graph.get(name) || [])].sort()) visit(target);
    stack.pop(); active.delete(name); done.add(name);
  }
  for (const name of [...graph.keys()].sort()) visit(name);
  return cycles;
}

function verifyWorkspaceBoundaries(workspaceRoot = path.resolve(__dirname, "..")) {
  const root = fs.realpathSync(workspaceRoot);
  const packageRoot = path.join(root, "packages");
  const packages = new Map(); const byName = new Map(); const graph = new Map();
  for (const entry of fs.readdirSync(packageRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("workspace packages must not be symbolic links");
    if (!entry.isDirectory()) continue;
    const directory = path.join(packageRoot, entry.name);
    const manifestPath = path.join(directory, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || !manifest.name || byName.has(manifest.name)) throw new Error("workspace package names must be unique non-empty strings");
    const record = { directory, folder: entry.name, manifest };
    packages.set(entry.name, record); byName.set(manifest.name, record); graph.set(entry.name, new Set());
  }
  if (packages.size === 0) throw new Error("no workspace packages found");
  const failures = []; const legacyEdges = []; let fileCount = 0;
  for (const current of packages.values()) {
    for (const file of sourceFiles(current.directory)) {
      fileCount += 1;
      const relativeFile = path.relative(root, file).replaceAll("\\", "/");
      const imports = collectImports(fs.readFileSync(file, "utf8"), path.basename(file));
      for (const { specifier, line } of imports) {
        const fail = (reason) => failures.push(`${relativeFile}:${line} ${reason}`);
        if (!specifier || specifier.includes("\0")) { fail("requires a literal, non-empty import"); continue; }
        if (isBuiltin(specifier)) continue;
        let target; let dependency;
        if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
          const requested = path.resolve(path.dirname(file), specifier);
          if (!within(root, requested)) { fail("import escapes the workspace"); continue; }
          let resolved;
          try { resolved = fs.realpathSync(require.resolve(requested)); }
          catch { fail("relative import cannot be resolved"); continue; }
          if (!within(root, resolved)) { fail("resolved import escapes the workspace"); continue; }
          if (within(current.directory, resolved)) continue;
          target = [...packages.values()].find((candidate) => within(candidate.directory, resolved));
          if (!target) {
            // Freeze the remaining migration edge, not entire entry-point
            // directories. New composition code must use workspace packages.
            const legacyTarget = path.relative(root, resolved).replaceAll("\\", "/");
            if (relativeFile === "packages/remote-mcp-server/bin/common-tools-team-image-worker.js"
              && legacyTarget === "skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js") {
              legacyEdges.push({ file: relativeFile, line, target: legacyTarget });
            } else fail("domain/runtime library imports outside workspace packages");
            continue;
          }
          dependency = target.manifest.name;
        } else {
          dependency = packageName(specifier);
          target = byName.get(dependency);
          if (target === current) continue;
        }
        if (!Object.hasOwn(current.manifest.dependencies || {}, dependency)) fail(`missing direct runtime dependency ${dependency}`);
        if (target) {
          graph.get(current.folder).add(target.folder);
          if (forbiddenLayer(current.folder, target.folder)) fail(`forbidden layer dependency ${current.folder} -> ${target.folder}`);
        }
      }
    }
  }
  for (const cycle of findCycles(graph)) failures.push(`workspace dependency cycle: ${cycle.join(" -> ")}`);
  if (failures.length) throw new Error(`workspace boundary verification failed:\n- ${failures.join("\n- ")}`);
  return { packageCount: packages.size, fileCount, legacyEdges };
}

if (require.main === module) {
  try {
    const result = verifyWorkspaceBoundaries();
    process.stdout.write(`verified ${result.fileCount} files in ${result.packageCount} workspace packages; ${result.legacyEdges.length} composition adapter imports remain for migration\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "workspace boundary verification failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = { collectImports, findCycles, forbiddenLayer, verifyWorkspaceBoundaries };
