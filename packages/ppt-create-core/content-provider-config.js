"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { ContentProviderRegistry, createHttpsJsonContentProvider } = require("./content-provider");

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_TOKEN_BYTES = 16 * 1024;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function checkedFile(file, maximum, label, allowedRoot) {
  let info;
  try { info = fs.lstatSync(file); } catch { throw new Error(`${label} is unavailable`); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) throw new Error(`${label} is invalid`);
  let realFile;
  try { realFile = fs.realpathSync.native(file); } catch { throw new Error(`${label} is unavailable`); }
  return allowedRoot === undefined ? realFile : insideRoot(allowedRoot, realFile);
}
function resolveFile(value, base, allowedRoot, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`${label} path is invalid`);
  const candidate = path.resolve(base, value);
  return allowedRoot === undefined ? candidate : insideRoot(allowedRoot, candidate);
}
function loadContentProviderConfig({ configFile, allowedRoot, fetchImpl = globalThis.fetch } = {}) {
  const root = allowedRoot === undefined ? undefined : path.resolve(allowedRoot);
  const file = checkedFile(resolveFile(configFile, root || process.cwd(), root, "content provider config"), MAX_CONFIG_BYTES, "content provider config", root);
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("content provider config is invalid JSON"); }
  if (!plainObject(value) || value.version !== "1.0" || Object.keys(value).sort().join(",") !== "providers,version" || !Array.isArray(value.providers) || value.providers.length < 1 || value.providers.length > 8) throw new Error("content provider config is invalid");
  const providers = value.providers.map((provider) => {
    if (!plainObject(provider) || Object.keys(provider).some((key) => !["endpoint", "id", "model", "timeoutMs", "tokenFile"].includes(key))) throw new Error("content provider entry is invalid");
    const tokenFile = checkedFile(resolveFile(provider.tokenFile, path.dirname(file), root, "content provider token"), MAX_TOKEN_BYTES, "content provider token", root);
    const token = fs.readFileSync(tokenFile, "utf8").trim();
    if (!token || token.length > MAX_TOKEN_BYTES) throw new Error("content provider token is invalid");
    return createHttpsJsonContentProvider({ id: provider.id, endpoint: provider.endpoint, model: provider.model, token, timeoutMs: provider.timeoutMs === undefined ? 30_000 : provider.timeoutMs, fetchImpl });
  });
  return new ContentProviderRegistry(providers);
}

module.exports = { MAX_CONFIG_BYTES, MAX_TOKEN_BYTES, loadContentProviderConfig };
