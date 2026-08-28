"use strict";

const { extractEntry } = require("../ppt-quality-core");

const MAX_SLIDE_XML_BYTES = 16 * 1024 * 1024;
const SLIDE_XML = /^ppt\/slides\/slide[1-9]\d*[.]xml$/u;

function replaceSlideXml(input, entries, transform) {
  const replacements = new Map();
  let changes = 0;
  for (const entry of entries.values()) {
    if (!SLIDE_XML.test(entry.name)) continue;
    if (entry.uncompressedBytes > MAX_SLIDE_XML_BYTES) throw new Error("PPT improvement slide XML exceeds the safe repair limit");
    const original = extractEntry(input, entry).toString("utf8");
    const result = transform(original);
    if (result.changes > 0) {
      replacements.set(entry.name, Buffer.from(result.xml, "utf8"));
      changes += result.changes;
    }
  }
  return Object.freeze({ replacements, changes });
}

function repairDuplicateDrawingIds(xml) {
  const used = new Set();
  const matches = [...xml.matchAll(/<p:cNvPr\b[^>]*\bid=(['"])(\d+)\1[^>]*>/gu)];
  if (matches.some((match) => !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 0 || Number(match[2]) > 0xffffffff)) throw new Error("PPT improvement found an invalid drawing id");
  let nextId = matches.reduce((maximum, match) => Math.max(maximum, Number(match[2])), 0) + 1;
  let changes = 0;
  const repaired = xml.replace(/<p:cNvPr\b[^>]*\bid=(['"])(\d+)\1[^>]*>/gu, (tag, quote, rawId) => {
    const id = Number(rawId);
    if (!used.has(id)) { used.add(id); return tag; }
    while (used.has(nextId) && nextId <= 0xffffffff) nextId++;
    if (nextId > 0xffffffff) throw new Error("PPT improvement cannot allocate a safe drawing id");
    const replacementId = nextId++;
    used.add(replacementId); changes++;
    return tag.replace(/\bid=(['"])\d+\1/u, `id=${quote}${replacementId}${quote}`);
  });
  return Object.freeze({ xml: repaired, changes });
}

function repairObjectNames(xml) {
  let changes = 0;
  const repaired = xml.replace(/<p:cNvPr\b[^>]*>/gu, (tag) => {
    const id = /\bid=(['"])(\d+)\1/u.exec(tag)?.[2];
    if (!id) return tag;
    const name = /\bname=(['"])(.*?)\1/u.exec(tag);
    if (name?.[2]?.trim()) return tag;
    changes++;
    if (name) return tag.replace(/\bname=(['"])(.*?)\1/u, `name=${name[1]}Object ${id}${name[1]}`);
    return /\s*\/>$/u.test(tag)
      ? tag.replace(/\s*\/>$/u, ` name="Object ${id}"/>`)
      : tag.replace(/>$/u, ` name="Object ${id}">`);
  });
  return Object.freeze({ xml: repaired, changes });
}

function inferredLanguage(text) {
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  if (/\p{Script=Latin}/u.test(text)) return "en-US";
  return undefined;
}

function repairRunLanguages(xml) {
  let changes = 0;
  const repaired = xml.replace(/<a:r\b[^>]*>[\s\S]*?<\/a:r>/gu, (run) => {
    const text = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/u.exec(run)?.[1];
    const language = text ? inferredLanguage(text) : undefined;
    if (!language || /<a:rPr\b[^>]*\blang=(['"]).*?\1/gu.test(run)) return run;
    changes++;
    if (/<a:rPr\b[^>]*\/>/u.test(run)) return run.replace(/<a:rPr\b([^>]*)\/>/u, `<a:rPr$1 lang="${language}"/>`);
    if (/<a:rPr\b[^>]*>/u.test(run)) return run.replace(/<a:rPr\b([^>]*)>/u, `<a:rPr$1 lang="${language}">`);
    return run.replace(/<a:t\b/u, `<a:rPr lang="${language}"/><a:t`);
  });
  return Object.freeze({ xml: repaired, changes });
}

function planProfileRepairs({ profile, input, entries, inspection }) {
  const removableNames = new Set(profile === "audit-only" ? [] : inspection.unusedMediaEntries.map((entry) => entry.name));
  let transformed = Object.freeze({ replacements: new Map(), changes: 0 });
  if (profile === "layout-safe") transformed = replaceSlideXml(input, entries, repairDuplicateDrawingIds);
  if (profile === "typography-safe") transformed = replaceSlideXml(input, entries, repairRunLanguages);
  if (profile === "editability-safe") transformed = replaceSlideXml(input, entries, repairObjectNames);
  const repairCounts = Object.freeze({
    removedMedia: removableNames.size,
    duplicateDrawingIds: profile === "layout-safe" ? transformed.changes : 0,
    languageTags: profile === "typography-safe" ? transformed.changes : 0,
    objectNames: profile === "editability-safe" ? transformed.changes : 0
  });
  const actionCount = Object.values(repairCounts).reduce((total, count) => total + count, 0);
  return Object.freeze({ removableNames, replacements: transformed.replacements, repairCounts, actionCount, changed: actionCount > 0 });
}

module.exports = { MAX_SLIDE_XML_BYTES, planProfileRepairs, repairDuplicateDrawingIds, repairObjectNames, repairRunLanguages };
