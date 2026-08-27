#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildPptxBatch } = require("./rebuild-real-pptx-native");

function parseArgs(argv = process.argv) {
  const args = {
    baseIrDir: path.join("ppt文档", "组件策略插件增强版本"),
    repairRoot: path.join("runs", "minimum-unit-gap-repair-queue-pptx"),
    out: path.join("runs", "minimum-unit-gap-repair-merged"),
    only: "",
    repairOnly: false,
    skipPptx: false,
    pptxEngine: "openxml",
    reportFile: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--base-ir-dir" && next) {
      args.baseIrDir = next;
      index += 1;
    } else if (arg === "--repair-root" && next) {
      args.repairRoot = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--only" && next) {
      args.only = next;
      index += 1;
    } else if (arg === "--repair-only") {
      args.repairOnly = true;
    } else if (arg === "--skip-pptx") {
      args.skipPptx = true;
    } else if (arg === "--pptx-engine" && next) {
      args.pptxEngine = next;
      index += 1;
    } else if (arg === "--report-file" && next) {
      args.reportFile = next;
      index += 1;
    } else {
      throw new Error(`Unknown minimum-unit-gap-repair-merge argument: ${arg}`);
    }
  }
  return args;
}

function mergeRepairRoot(options = {}) {
  const baseIrDir = path.resolve(options.baseIrDir || path.join("ppt文档", "组件策略插件增强版本"));
  const repairRoot = path.resolve(options.repairRoot || path.join("runs", "minimum-unit-gap-repair-queue-pptx"));
  const outRoot = path.resolve(options.out || path.join("runs", "minimum-unit-gap-repair-merged"));
  const only = safeString(options.only).toLowerCase();
  fs.mkdirSync(outRoot, { recursive: true });

  const repairDecks = discoverRepairDecks(repairRoot)
    .filter((deck) => !only || deck.deck.toLowerCase() === only);
  const repairDeckByName = new Map(repairDecks.map((deck) => [deck.deck, deck]));
  const targetDecks = options.repairOnly
    ? repairDecks
    : discoverBaseDecks(baseIrDir)
      .filter((deck) => !only || deck.deck.toLowerCase() === only);
  const results = [];
  const pptxJobs = [];
  for (const targetDeck of targetDecks) {
    const repairDeck = repairDeckByName.get(targetDeck.deck) || null;
    const baseIrFile = targetDeck.irFile || path.join(baseIrDir, `${targetDeck.deck}.native.ir.json`);
    if (!fs.existsSync(baseIrFile)) {
      results.push({
        deck: targetDeck.deck,
        status: "skipped",
        reason: "base-ir-missing",
        baseIrFile
      });
      continue;
    }
    const merged = repairDeck
      ? mergeDeck({
        deck: targetDeck.deck,
        baseIrFile,
        repairIrFile: repairDeck.irFile
      })
      : cloneBaseDeck({ baseIrFile });
    copyDeckAssets({
      deck: targetDeck.deck,
      baseIrDir,
      repairDeckDir: repairDeck?.dir || "",
      outRoot
    });
    const outputIr = path.join(outRoot, `${targetDeck.deck}.native.ir.json`);
    const outputPptx = path.join(outRoot, `${targetDeck.deck}.native-editable.pptx`);
    writeJson(outputIr, merged.ir);
    if (!options.skipPptx) {
      pptxJobs.push({ irFile: outputIr, outFile: outputPptx, baseName: targetDeck.deck });
    }
    results.push({
      deck: targetDeck.deck,
      status: repairDeck ? "merged" : "copied",
      baseIrFile,
      repairIrFile: repairDeck?.irFile || null,
      outputIr,
      outputPptx: options.skipPptx ? null : outputPptx,
      pages: merged.ir.pages.length,
      replacedPages: merged.replacedPages
    });
  }

  let pptxBuilds = [];
  if (pptxJobs.length > 0) {
    pptxBuilds = buildPptxBatch(pptxJobs, {
      pptxEngine: options.pptxEngine || "openxml",
      openXmlBatch: true
    });
  }
  const report = {
    provider: "minimum-unit-gap-repair-merge-v1",
    generatedAt: new Date().toISOString(),
    baseIrDir,
    repairRoot,
    outRoot,
    summary: {
      decks: results.length,
      mergedDecks: results.filter((result) => result.status === "merged").length,
      copiedDecks: results.filter((result) => result.status === "copied").length,
      skippedDecks: results.filter((result) => result.status === "skipped").length,
      replacedPages: results.reduce((sum, result) => sum + safeArray(result.replacedPages).length, 0),
      pptxJobs: pptxJobs.length
    },
    results,
    pptxBuilds
  };
  writeJson(options.reportFile || path.join(outRoot, "minimum-unit-gap-repair-merge-report.json"), report);
  return report;
}

function discoverBaseDecks(baseIrDir) {
  if (!fs.existsSync(baseIrDir)) return [];
  return fs.readdirSync(baseIrDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => !entry.name.startsWith(".") && /\.native\.ir\.json$/i.test(entry.name))
    .map((entry) => {
      const deck = entry.name.replace(/\.native\.ir\.json$/i, "");
      return {
        deck,
        irFile: path.join(baseIrDir, entry.name)
      };
    })
    .sort((a, b) => a.deck.localeCompare(b.deck));
}

function discoverRepairDecks(repairRoot) {
  if (!fs.existsSync(repairRoot)) return [];
  return fs.readdirSync(repairRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const deck = entry.name;
      const dir = path.join(repairRoot, deck);
      const irFile = path.join(dir, `${deck}.native.ir.json`);
      return { deck, dir, irFile };
    })
    .filter((entry) => fs.existsSync(entry.irFile))
    .sort((a, b) => a.deck.localeCompare(b.deck));
}

function cloneBaseDeck({ baseIrFile }) {
  const baseIr = readJson(baseIrFile);
  return {
    ir: {
      ...baseIr,
      meta: {
        ...(baseIr.meta || {}),
        minimumUnitGapRepairMergedAt: new Date().toISOString(),
        minimumUnitGapRepairSource: null,
        minimumUnitGapRepairReplacedPages: []
      }
    },
    replacedPages: []
  };
}

function mergeDeck({ deck, baseIrFile, repairIrFile }) {
  const baseIr = readJson(baseIrFile);
  const repairIr = readJson(repairIrFile);
  const basePages = safeArray(baseIr.pages);
  const pages = basePages.map((page) => cloneJson(page));
  const replacedPages = [];
  for (const repairPage of safeArray(repairIr.pages)) {
    const pageIndex = pageIndexForRepairPage(repairPage);
    if (pageIndex < 0 || pageIndex >= pages.length) {
      throw new Error(`Repair page for ${deck} has invalid pageIndex ${pageIndex}`);
    }
    pages[pageIndex] = {
      ...cloneJson(repairPage),
      pageIndex
    };
    replacedPages.push(pageIndex + 1);
  }
  return {
    ir: {
      ...baseIr,
      meta: {
        ...(baseIr.meta || {}),
        minimumUnitGapRepairMergedAt: new Date().toISOString(),
        minimumUnitGapRepairSource: repairIrFile,
        minimumUnitGapRepairReplacedPages: replacedPages
      },
      pages
    },
    replacedPages
  };
}

function pageIndexForRepairPage(page = {}) {
  const value = Number(page.pageIndex);
  if (Number.isInteger(value) && value >= 0) return value;
  const oneBased = Number(page.slide || page.page);
  if (Number.isInteger(oneBased) && oneBased > 0) return oneBased - 1;
  return -1;
}

function copyDeckAssets({ deck, baseIrDir, repairDeckDir, outRoot }) {
  copyDirIfExists(path.join(baseIrDir, `${deck}.assets`), path.join(outRoot, `${deck}.assets`));
  if (repairDeckDir) copyDirIfExists(path.join(repairDeckDir, `${deck}.assets`), path.join(outRoot, `${deck}.assets`));
}

function copyDirIfExists(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return;
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDirIfExists(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return value == null ? "" : String(value);
}

if (require.main === module) {
  try {
    const report = mergeRepairRoot(parseArgs(process.argv));
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  cloneBaseDeck,
  discoverBaseDecks,
  discoverRepairDecks,
  mergeDeck,
  mergeRepairRoot,
  pageIndexForRepairPage,
  parseArgs
};
