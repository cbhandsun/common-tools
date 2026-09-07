// @ts-check
"use strict";

/** @param {unknown} prefix @returns {string} */
function assertRetentionPrefix(prefix) {
  if (typeof prefix !== "string" || !/^owners\/[a-f0-9]{64}\/jobs\/[a-zA-Z0-9_-]{1,128}\/$/.test(prefix)) throw new TypeError("retention output prefix is invalid");
  return prefix;
}

/** Collect and validate the entire bounded listing before any deletion.
 * @param {{prefix: unknown, listPage: (input: {prefix: string, continuationToken?: string}) => Promise<unknown>}} options
 * @returns {Promise<string[]>}
 */
async function collectRetentionOutputKeys({ prefix, listPage }) {
  const checked = assertRetentionPrefix(prefix);
  if (typeof listPage !== "function") throw new TypeError("retention listing service is invalid");
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Set<string>} */
  const cursors = new Set();
  /** @type {string | undefined} */
  let cursor;
  for (let page = 0; page < 10; page++) {
    const response = await listPage({ prefix: checked, ...(cursor === undefined ? {} : { continuationToken: cursor }) });
    if (!response || typeof response !== "object" || !("keys" in response) || !Array.isArray(response.keys) || response.keys.length > 1000 || !("nextToken" in response)) throw new Error("retention listing is invalid");
    for (const key of response.keys) {
      if (typeof key !== "string" || key.length > 1024 || !key.startsWith(checked) || key.length === checked.length || [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("retention listed key is invalid");
      keys.add(key);
    }
    const next = response.nextToken;
    if (next === null) return [...keys];
    if (typeof next !== "string" || !next || next.length > 4096 || cursors.has(next)) throw new Error("retention listing cursor is invalid");
    cursors.add(next);
    cursor = next;
  }
  throw new Error("retention listing exceeds the bounded page limit");
}

module.exports = { assertRetentionPrefix, collectRetentionOutputKeys };
