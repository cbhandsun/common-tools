"use strict";

const DEFAULT_BASE_URL = "https://api.islide.cc";

const CONTENT_TYPES = {
  diagram: "diagram",
  smartdiagram: "smartdiagram",
  icon: "icon",
  vector: "vector",
  picture: "picture",
  template: "template"
};

function normalizeIslideKind(kind) {
  const normalized = safeString(kind).toLowerCase().replace(/[-_ ]/g, "");
  if (normalized === "component" || normalized === "shape") return "diagram";
  if (normalized === "ppt" || normalized === "presentation") return "template";
  if (normalized === "smartart" || normalized === "smartdiagram") return "smartdiagram";
  return CONTENT_TYPES[normalized] || "diagram";
}

async function searchIslideContents(options = {}) {
  const kind = normalizeIslideKind(options.kind);
  const query = sanitizeSearchQuery({ ...options, kind });
  const baseUrl = safeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available in this Node runtime");
  const endpoint = `/v7/contents?${new URLSearchParams(query).toString()}`;
  const response = await fetchImpl(`${baseUrl}${endpoint}`, {
    method: "GET",
    headers: buildHeaders(options),
    signal: options.signal
  });
  const text = await response.text();
  const payload = parseJsonResponse(text);
  if (!response.ok || Number(payload?.code) !== 200) {
    const code = payload?.code || response.status;
    const message = payload?.error || payload?.message || response.statusText || "iSlide content search failed";
    const error = new Error(`iSlide ${kind} search failed: ${code} ${message || ""}`.trim());
    error.status = response.status;
    error.payload = summarizeIslideError(payload);
    throw error;
  }
  return normalizeSearchResult({ kind, endpoint, query, payload });
}

function sanitizeSearchQuery(options = {}) {
  return {
    type: normalizeIslideKind(options.kind),
    keywords: sanitizeKeyword(options.keywords),
    size: String(clampInteger(options.size, 1, 50, 12)),
    start: String(clampInteger(options.start, 0, 5000, 0))
  };
}

function buildHeaders() {
  return {
    accept: "application/json"
  };
}

function normalizeSearchResult({ kind, endpoint, query, payload }) {
  const body = payload?.body && typeof payload.body === "object" ? payload.body : {};
  const items = Array.isArray(body.items) ? body.items : [];
  return {
    provider: "islide-search-v1",
    kind,
    endpoint,
    query,
    total: safeNumber(body.total ?? body.viewTotal ?? items.length),
    hasMore: Number(body.currentPageTotal || items.length) >= Number(query.size || 0),
    documents: items.map((item) => normalizeDocument(item, kind))
  };
}

function normalizeDocument(item = {}, kind) {
  const files = Array.isArray(item.files)
    ? item.files.map((file) => ({
      key: safeString(file?.key),
      name: safeString(file?.name),
      isDefault: Boolean(file?.isDefault)
    })).filter((file) => file.key || file.name)
    : [];
  const group = item.group && typeof item.group === "object" ? item.group : {};
  const title = safeString(item.title || item.name);
  return {
    id: safeString(item.id || item.uniqueId),
    kind,
    title,
    description: safeString(item.description),
    uniqueId: safeString(item.uniqueId),
    coverUrl: safeUrl(item.thumbnail || item.preview),
    previewUrl: safeUrl(item.preview),
    gallery: sanitizeStringArray(item.gallery).map(safeUrl).filter(Boolean).slice(0, 8),
    groupId: safeString(group.id),
    permission: safeString(group.permission),
    downloadable: Boolean(item.downloadable),
    files,
    tags: inferTags({ kind, title }),
    paymentType: safeString(group.permission),
    score: safeNumber(item.score),
    reuseHint: inferReuseHint({ kind, item, title })
  };
}

function inferReuseHint({ kind, item = {}, title = "" }) {
  const text = `${kind} ${title} ${item.type || ""}`.toLowerCase();
  if (kind === "smartdiagram") return "candidate-smart-diagram-reference";
  if (kind === "diagram") return "candidate-polished-diagram-reference";
  if (kind === "template") return "candidate-template-style-reference";
  if (kind === "icon" || kind === "vector") return "candidate-vector-or-icon-match";
  if (kind === "picture") return "candidate-raster-style-reference";
  if (/流程|关系图|循环|架构|timeline|时间轴/.test(text)) return "candidate-polished-diagram-reference";
  return "candidate-style-reference";
}

function inferTags({ kind, title }) {
  const tags = [kind];
  if (/流程|步骤/.test(title)) tags.push("流程");
  if (/时间轴|里程碑/.test(title)) tags.push("时间轴");
  if (/关系|中心|辐射/.test(title)) tags.push("关系图");
  if (/矩阵|四象限/.test(title)) tags.push("矩阵");
  if (/图标/.test(title)) tags.push("图标");
  return [...new Set(tags)];
}

function summarizeIslideError(payload) {
  if (!payload || typeof payload !== "object") return {};
  return {
    code: payload.code ?? null,
    error: safeString(payload.error || payload.message),
    actions: Array.isArray(payload.actions) ? payload.actions.map((action) => safeString(action?.type)).filter(Boolean) : []
  };
}

function parseJsonResponse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: safeString(text).slice(0, 200) };
  }
}

function sanitizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeString(value)).filter(Boolean).slice(0, 80);
}

function sanitizeKeyword(value) {
  return safeString(value).slice(0, 80);
}

function safeBaseUrl(value) {
  const text = safeString(value).replace(/\/$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(text) ? text : DEFAULT_BASE_URL;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeUrl(value) {
  const text = safeString(value);
  return /^https?:\/\//i.test(text) ? text : "";
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

module.exports = {
  CONTENT_TYPES,
  DEFAULT_BASE_URL,
  normalizeIslideKind,
  searchIslideContents,
  _private: {
    buildHeaders,
    inferReuseHint,
    normalizeSearchResult,
    sanitizeSearchQuery,
    summarizeIslideError
  }
};
