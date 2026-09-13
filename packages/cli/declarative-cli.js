// @ts-check
"use strict";

const fs = require("node:fs");
const { createTemplateStore } = require("../slideclone-core/component-template-store");
const { validateComponentTemplate } = require("../slideclone-core/component-template-catalog");
const { harvestComponentTemplate } = require("../slideclone-core/component-template-harvester");
const { assessHeadlessQuality } = require("../slideclone-core/headless-quality-assessor");
const { applyBrandKitStyling } = require("../slideclone-core/brand-kit-styler");
const { resolveWorkspaceChild } = require("./local-doctor");

const MAX_DECLARATIVE_JSON_BYTES = 8 * 1024 * 1024;

/**
 * @param {string} workspaceRoot
 * @param {unknown} candidate
 * @param {string} label
 * @returns {string}
 */
function resolvePath(workspaceRoot, candidate, label) {
  return resolveWorkspaceChild(workspaceRoot, candidate, label);
}

/**
 * @param {string} file
 * @param {string} label
 * @returns {unknown}
 */
function readJsonFile(file, label) {
  const content = readBoundedTextFile(file, label);
  if (!content.trim()) throw new Error(`${label} must not be empty`);
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

/**
 * @param {string} file
 * @param {string} label
 * @returns {string}
 */
function readBoundedTextFile(file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  if (stat.size <= 0) throw new Error(`${label} must not be empty`);
  if (stat.size > MAX_DECLARATIVE_JSON_BYTES) throw new Error(`${label} exceeds the maximum JSON size`);
  return fs.readFileSync(file, "utf8");
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parsePageIndex(value) {
  if (value === undefined) return 0;
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("--page must be a non-negative integer");
  return index;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number | undefined}
 */
function optionalRatio(value, label) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label} must be a number between 0 and 1`);
  return number;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} min
 * @param {number} max
 * @returns {number | undefined}
 */
function optionalInteger(value, label, min, max) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return number;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function asJsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function optionalCsv(value) {
  return typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

/**
 * @param {string} content
 * @returns {Array<import("../slideclone-core/component-template-harvester").ComponentTemplate>}
 */
function parseTemplateBundle(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("template bundle file must contain valid JSON");
  }
  if (!Array.isArray(parsed)) throw new TypeError("template bundle must be a JSON array");
  return parsed.map((item, index) => validateComponentTemplate(item, `template bundle[${index}]`));
}

/**
 * Handle "common-tools template" subcommands.
 * @param {{ workspaceRoot: string, stateRoot: string }} ctx
 * @param {string} action
 * @param {Record<string, unknown>} args
 * @returns {number}
 */
function runTemplateCommand(ctx, action, args = {}) {
  const store = createTemplateStore({ root: ctx.stateRoot });
  const catalog = store.loadCatalog();

  if (action === "list") {
    const list = catalog.list({ category: optionalString(args.category), archetype: optionalString(args.archetype) });
    process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    return 0;
  }

  if (action === "show") {
    if (!args.id) throw new Error("template show requires --id");
    const tpl = catalog.get(String(args.id));
    if (!tpl) {
      process.stderr.write(`template not found: ${args.id}\n`);
      return 1;
    }
    process.stdout.write(`${JSON.stringify(tpl, null, 2)}\n`);
    return 0;
  }

  if (action === "export") {
    const json = catalog.exportJson();
    if (args.out) {
      const outFile = resolvePath(ctx.workspaceRoot, args.out, "output file");
      fs.writeFileSync(outFile, json, "utf8");
    } else {
      process.stdout.write(`${json}\n`);
    }
    return 0;
  }

  if (action === "import") {
    if (!args.file) throw new Error("template import requires --file");
    const file = resolvePath(ctx.workspaceRoot, args.file, "template bundle file");
    const content = readBoundedTextFile(file, "template bundle file");
    const templates = parseTemplateBundle(content);
    const storedIds = new Set(store.list().map((item) => item.id));
    const catalogIds = new Set(catalog.list().map((tpl) => tpl.id));
    const count = catalog.importJson(content);
    for (const tpl of templates) {
      if (catalogIds.has(tpl.id) && !storedIds.has(tpl.id)) continue;
      store.save(tpl);
    }
    process.stdout.write(`${JSON.stringify({ status: "imported", count }, null, 2)}\n`);
    return 0;
  }

  if (action === "harvest") {
    if (!args.ir) throw new Error("template harvest requires --ir");
    const irPath = resolvePath(ctx.workspaceRoot, args.ir, "IR file");
    const ir = readJsonFile(irPath, "IR file");
    const pageIndex = parsePageIndex(args.page);
    const page = ir && typeof ir === "object" && Array.isArray(/** @type {{pages?: unknown}} */ (ir).pages) ? /** @type {{pages: unknown[]}} */ (ir).pages[pageIndex] : ir;
    if (!page) throw new Error(`page ${pageIndex} not found in IR`);

    const shapes = page && typeof page === "object" && Array.isArray(/** @type {{shapes?: unknown}} */ (page).shapes) ? /** @type {{shapes: unknown[]}} */ (page).shapes : [];
    const textBoxes = page && typeof page === "object" && Array.isArray(/** @type {{textBoxes?: unknown}} */ (page).textBoxes) ? /** @type {{textBoxes: unknown[]}} */ (page).textBoxes : [];

    const template = harvestComponentTemplate(shapes, textBoxes, {
      id: optionalString(args.id),
      archetype: optionalString(args.archetype),
      category: optionalString(args.category),
      tags: optionalCsv(args.tags)
    });

    if (args.out) {
      const outFile = resolvePath(ctx.workspaceRoot, args.out, "output file");
      fs.writeFileSync(outFile, JSON.stringify(template, null, 2), "utf8");
    } else {
      store.save(template);
      process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
    }
    return 0;
  }

  throw new Error(`unknown template action: ${action}`);
}

/**
 * Handle "common-tools quality-headless" command.
 * @param {{ workspaceRoot: string }} ctx
 * @param {Record<string, unknown>} args
 * @returns {number}
 */
function runHeadlessQualityCommand(ctx, args = {}) {
  if (!args.input) throw new Error("quality-headless requires --input");
  const inputPath = resolvePath(ctx.workspaceRoot, args.input, "input file");
  const raw = readJsonFile(inputPath, "input file");
  const pageIndex = parsePageIndex(args.page);
  const page = raw && typeof raw === "object" && Array.isArray(/** @type {{pages?: unknown}} */ (raw).pages) ? /** @type {{pages: unknown[]}} */ (raw).pages[pageIndex] : raw;
  if (!page) throw new Error("no valid page data found in input");

  const slideSize = raw && typeof raw === "object" && /** @type {{slideSize?: unknown}} */ (raw).slideSize || { widthPt: 960, heightPt: 540 };
  const referenceImage = args["reference-png"] ? resolvePath(ctx.workspaceRoot, args["reference-png"], "reference PNG file") : undefined;
  const renderedImage = args["rendered-png"] ? resolvePath(ctx.workspaceRoot, args["rendered-png"], "rendered PNG file") : undefined;
  const report = assessHeadlessQuality(page, slideSize, {
    referenceImage,
    renderedImage,
    minSsim: optionalRatio(args["min-ssim"], "--min-ssim"),
    maxPhashDistance: optionalInteger(args["max-phash-distance"], "--max-phash-distance", 0, 63)
  });

  if (args.out) {
    const outFile = resolvePath(ctx.workspaceRoot, args.out, "output report file");
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.passed ? 0 : 1;
}

/**
 * Handle "common-tools retheme" command.
 * @param {{ workspaceRoot: string }} ctx
 * @param {Record<string, unknown>} args
 * @returns {number}
 */
function runRethemeCommand(ctx, args = {}) {
  if (!args.input || !args["brand-kit"] || !args.out) {
    throw new Error("retheme requires --input, --brand-kit, and --out");
  }
  const inputPath = resolvePath(ctx.workspaceRoot, args.input, "input file");
  const brandKitPath = resolvePath(ctx.workspaceRoot, args["brand-kit"], "brand kit file");
  const outPath = resolvePath(ctx.workspaceRoot, args.out, "output file");

  const deck = asJsonObject(readJsonFile(inputPath, "input file"), "input file");
  const brandKit = readJsonFile(brandKitPath, "brand kit file");

  if (Array.isArray(deck.pages)) {
    for (const rawPage of deck.pages) {
      const page = asJsonObject(rawPage, "deck page");
      const styled = applyBrandKitStyling(Array.isArray(page.shapes) ? page.shapes : [], Array.isArray(page.textBoxes) ? page.textBoxes : [], brandKit);
      page.shapes = styled.shapes;
      page.textBoxes = styled.textBoxes;
    }
  } else {
    const styled = applyBrandKitStyling(Array.isArray(deck.shapes) ? deck.shapes : [], Array.isArray(deck.textBoxes) ? deck.textBoxes : [], brandKit);
    deck.shapes = styled.shapes;
    deck.textBoxes = styled.textBoxes;
  }

  fs.writeFileSync(outPath, JSON.stringify(deck, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify({ status: "rethemed", out: outPath }, null, 2)}\n`);
  return 0;
}

module.exports = {
  asJsonObject,
  optionalCsv,
  optionalInteger,
  optionalRatio,
  optionalString,
  parseTemplateBundle,
  parsePageIndex,
  readJsonFile,
  resolvePath,
  runHeadlessQualityCommand,
  runRethemeCommand,
  runTemplateCommand
};
