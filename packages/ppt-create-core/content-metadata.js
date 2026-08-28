"use strict";

const { containsControlCharacter } = require("../capability-contracts");

const MAX_CITATIONS = 5;
const MAX_SPEAKER_NOTES = 4000;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value, label, maximum) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized || normalized.length > maximum || containsControlCharacter(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}
function normalizeLocator(value, label) {
  const locator = text(value, label, 500);
  if (locator.includes("://")) {
    let parsed; try { parsed = new URL(locator); } catch { throw new TypeError(`${label} URL is invalid`); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new TypeError(`${label} URL is invalid`);
  }
  return locator;
}
function normalizeCitations(value, slideIndex) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CITATIONS) throw new TypeError(`slide ${slideIndex + 1} citations are invalid`);
  const seen = new Set();
  return Object.freeze(value.map((citation, index) => {
    const label = `slide ${slideIndex + 1} citation ${index + 1}`;
    if (!plainObject(citation) || Object.keys(citation).some((key) => !["id", "title", "locator", "accessedAt", "license"].includes(key))) throw new TypeError(`${label} is invalid`);
    const id = text(citation.id, `${label} id`, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id) || seen.has(id)) throw new TypeError(`slide ${slideIndex + 1} citation ids must be unique and valid`);
    seen.add(id);
    if (citation.accessedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(citation.accessedAt)) throw new TypeError(`${label} accessedAt is invalid`);
    return Object.freeze({ id, title: text(citation.title, `${label} title`, 160), locator: normalizeLocator(citation.locator, `${label} locator`), ...(citation.accessedAt ? { accessedAt: citation.accessedAt } : {}), ...(citation.license === undefined ? {} : { license: text(citation.license, `${label} license`, 160) }) });
  }));
}
function normalizeSpeakerNotes(value, slideIndex) {
  return value === undefined ? undefined : text(value, `slide ${slideIndex + 1} speakerNotes`, MAX_SPEAKER_NOTES);
}
function citationFooter(citations) { return citations.map((citation, index) => `[${index + 1}] ${citation.title}`).join("  ·  "); }
function composeSpeakerNotes(notes, citations) {
  const sources = citations.map((citation, index) => `[${index + 1}] ${citation.title} — ${citation.locator}${citation.accessedAt ? ` (accessed ${citation.accessedAt})` : ""}${citation.license ? ` [${citation.license}]` : ""}`).join("\n");
  return [notes, sources ? `Sources:\n${sources}` : undefined].filter(Boolean).join("\n\n");
}

module.exports = { MAX_CITATIONS, MAX_SPEAKER_NOTES, citationFooter, composeSpeakerNotes, normalizeCitations, normalizeSpeakerNotes };
