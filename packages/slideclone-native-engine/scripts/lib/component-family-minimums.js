"use strict";

const { COMPONENT_FAMILY_IDS } = require("./component-motifs");

function normalizeComponentFamilyMinimums(value) {
  if (value === undefined || value === null || value === "") return {};
  const rawEntries = componentFamilyMinimumEntries(value);
  const out = {};
  for (const [rawFamily, rawCount] of rawEntries) {
    const family = String(rawFamily || "").trim();
    const count = Number(rawCount);
    if (!COMPONENT_FAMILY_IDS.includes(family) || !Number.isInteger(count) || count <= 0) continue;
    out[family] = count;
  }
  return Object.fromEntries(Object.entries(out).sort(([left], [right]) => left.localeCompare(right)));
}

function componentFamilyMinimumEntries(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").split(/[:=]/));
  }
  if (typeof value === "object") return Object.entries(value);
  return String(value).split(/[;,]/).map((item) => item.split(/[:=]/));
}

function missingComponentFamilyMinimums(actual = {}, minimums = {}) {
  const missing = {};
  for (const [family, minimum] of Object.entries(minimums || {})) {
    const current = Number(actual?.[family] || 0);
    if (!Number.isFinite(current) || current < minimum) {
      missing[family] = { expected: minimum, actual: Number.isFinite(current) ? current : 0 };
    }
  }
  return missing;
}

function normalizeRequiredComponentFamilies(value) {
  if (value === undefined || value === null || value === "") return [];
  const items = Array.isArray(value) ? value : String(value).split(/[;,]/);
  return [...new Set(items
    .map((item) => String(item || "").trim())
    .filter((item) => COMPONENT_FAMILY_IDS.includes(item))
  )].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  missingComponentFamilyMinimums,
  normalizeComponentFamilyMinimums,
  normalizeRequiredComponentFamilies
};
