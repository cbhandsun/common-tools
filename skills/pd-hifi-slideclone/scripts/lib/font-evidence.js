"use strict";

function measuredFontSize(item, fallback, options = {}) {
  const minimum = boundedNumber(options.minimum ?? 7, "minimum", 1, 1000);
  const maximum = boundedNumber(options.maximum ?? 400, "maximum", minimum, 1000);
  const fallbackSize = boundedNumber(fallback, "fallback font size", 1, 1000);
  const measured = Number(item?.font?.sizePt);
  return Number.isFinite(measured) && measured >= minimum && measured <= maximum
    ? round(measured)
    : fallbackSize;
}

function resolveRoleFontSize(role, fallback, roleSizes = {}) {
  if (!roleSizes || typeof roleSizes !== "object" || Array.isArray(roleSizes)) throw new TypeError("role font sizes must be an object");
  const key = String(role || "");
  if (Object.prototype.hasOwnProperty.call(roleSizes, key)) return boundedNumber(roleSizes[key], `font size for role ${key}`, 1, 1000);
  return boundedNumber(fallback || 12, "fallback font size", 1, 1000);
}

function boundedNumber(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new TypeError(`${label} must be between ${minimum} and ${maximum}`);
  return number;
}

function round(value) { return Number(value.toFixed(3)); }

module.exports = { measuredFontSize, resolveRoleFontSize };
