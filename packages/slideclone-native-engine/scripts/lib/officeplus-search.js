"use strict";

const crypto = require("node:crypto");

const DEFAULT_BASE_URL = "https://api.officeplus.cn/api";

const SEARCH_ENDPOINTS = {
  component: "/addin/v4.1/search/component-content/search",
  shape: "/addin/v4.1/search/shape-content/search",
  icon: "/addin/v4.1/search/icongroup-content/search",
  vector: "/addin/v4.1/search/vector-content/search",
  picture: "/addin/v4.1/cms/image-content/search",
  textbox: "/addin/v4.1/search/textbox-content/search",
  ppt: "/addin/v4.1/search/ppt-content/search"
};

function normalizeOfficePlusKind(kind) {
  const normalized = String(kind || "component").trim().toLowerCase();
  if (normalized === "diagram") return "component";
  if (normalized === "textBox".toLowerCase()) return "textbox";
  return SEARCH_ENDPOINTS[normalized] ? normalized : "component";
}

async function searchOfficePlusComponents(options = {}) {
  const kind = normalizeOfficePlusKind(options.kind);
  const endpoint = SEARCH_ENDPOINTS[kind];
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const body = sanitizeSearchBody(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available in this Node runtime");
  const response = await fetchImpl(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: buildHeaders(options),
    body: JSON.stringify(body),
    signal: options.signal
  });
  const text = await response.text();
  const payload = parseJsonResponse(text);
  if (!response.ok) {
    const message = payload?.message || response.statusText || "OfficePLUS search failed";
    const error = new Error(`OfficePLUS ${kind} search failed: ${response.status} ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return normalizeSearchResult({ kind, endpoint, body, payload });
}

async function getOfficePlusDownloadUrl(documentId, options = {}) {
  const id = safeString(documentId);
  if (!/^[A-Za-z]+Content-\d+$/.test(id)) throw new Error("invalid OfficePLUS document id");
  const kind = normalizeOfficePlusKind(options.kind);
  const endpoint = downloadEndpointFor({ id, kind, anonymous: options.anonymous === true });
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available in this Node runtime");
  const response = await fetchImpl(`${baseUrl}${endpoint}`, {
    method: "GET",
    headers: buildHeaders(options),
    signal: options.signal
  });
  const text = await response.text();
  const payload = parseJsonResponse(text);
  if (!response.ok) {
    const message = payload?.message || response.statusText || "OfficePLUS download URL lookup failed";
    const error = new Error(`OfficePLUS download URL lookup failed: ${response.status} ${message || ""}`.trim());
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return normalizeDownloadUrlResult({ id, kind, endpoint, payload });
}

function sanitizeSearchBody(options = {}) {
  const size = clampInteger(options.size, 1, 50, 12);
  const start = clampInteger(options.start, 0, 5000, 0);
  return {
    start,
    size,
    subcategoryIds: sanitizeStringArray(options.subcategoryIds),
    tags: sanitizeStringArray(options.tags),
    keywords: sanitizeKeyword(options.keywords),
    ...(options.paymentType === undefined || options.paymentType === null ? {} : { paymentType: options.paymentType })
  };
}

function buildHeaders(options = {}) {
  const deviceId = sanitizeDeviceId(options.deviceId || process.env.OFFICEPLUS_DEVICE_ID || crypto.randomUUID());
  return {
    accept: "application/json",
    "content-type": "application/json",
    DeviceId: deviceId
  };
}

function downloadEndpointFor({ id, kind, anonymous = false }) {
  if (kind === "icon" || kind === "vector" || kind === "textbox") {
    return `/addin/v4.1/download/${encodeURIComponent(id)}/download-url`;
  }
  return anonymous
    ? `/addin/v3.4/download/${encodeURIComponent(id)}/anonymous/download-url`
    : `/addin/v3.4/download/${encodeURIComponent(id)}/download-url`;
}

function normalizeSearchResult({ kind, endpoint, body, payload }) {
  const documents = Array.isArray(payload?.documents)
    ? payload.documents
    : Array.isArray(payload?.data?.documents)
      ? payload.data.documents
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
  return {
    provider: "officeplus-search-v1",
    kind,
    endpoint,
    query: body,
    total: Number(payload?.total || payload?.count || payload?.data?.total || documents.length || 0),
    hasMore: Boolean(payload?.hasMore ?? payload?.data?.hasMore ?? documents.length >= body.size),
    documents: documents.map((item) => normalizeDocument(item, kind))
  };
}

function normalizeDocument(item = {}, kind) {
  const tags = [
    ...tagNames(item.l1Tags),
    ...tagNames(item.l2Tags),
    ...tagNames(item.l3Tags),
    ...tagNames(item.l4Tags),
    ...sanitizeStringArray(item.keywords)
  ];
  return {
    id: safeString(item.id),
    kind,
    title: safeString(item.title || item.name),
    description: safeString(item.description),
    fileName: safeString(item.fileName),
    secondaryFileName: safeString(item.fileName2),
    fileSize: safeNumber(item.fileSize),
    secondaryFileSize: safeNumber(item.fileSize2),
    pageNumber: safeNumber(item.pageNumber),
    itemCount: safeNumber(item.itemCount),
    resolution: safeString(item.resolution),
    coverUrl: safeUrl(item.coverFileName || item.coverFile2Name),
    secondaryCoverUrl: safeUrl(item.coverFile2Name),
    attachments: sanitizeStringArray(item.attachments).map(safeUrl).filter(Boolean),
    tags: [...new Set(tags.filter(Boolean))].slice(0, 40),
    paymentType: item.paymentType ?? null,
    price: safeNumber(item.price),
    popularity: safeNumber(item.popularity),
    score: safeNumber(item.score),
    onlineTime: safeString(item.onlineTime),
    reuseHint: inferReuseHint({ kind, item, tags })
  };
}

function normalizeDownloadUrlResult({ id, kind, endpoint, payload }) {
  const rawUrl = payload?.url || payload?.downloadUrl || payload?.data?.url || payload?.data?.downloadUrl || payload?.content?.url || payload?.content?.downloadUrl;
  return {
    provider: "officeplus-download-url-v1",
    id,
    kind,
    endpoint,
    downloadUrl: safeUrl(rawUrl),
    rawKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : []
  };
}

function inferReuseHint({ kind, item = {}, tags = [] }) {
  const text = `${kind} ${item.title || ""} ${item.description || ""} ${tags.join(" ")}`.toLowerCase();
  if (kind === "component" && /流程|关系图|循环|架构|timeline|时间轴/.test(text)) return "candidate-grouped-pptx-component";
  if (kind === "shape") return "candidate-native-shape-style";
  if (kind === "vector" || kind === "icon") return "candidate-vector-or-icon-match";
  if (kind === "ppt") return "candidate-template-style-reference";
  return "candidate-style-reference";
}

function parseJsonResponse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: text };
  }
}

function tagNames(tags = []) {
  return Array.isArray(tags) ? tags.map((tag) => safeString(tag?.name)).filter(Boolean) : [];
}

function sanitizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeString(value)).filter(Boolean).slice(0, 80);
}

function sanitizeKeyword(value) {
  return safeString(value).slice(0, 80);
}

function sanitizeDeviceId(value) {
  const text = safeString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : crypto.randomUUID();
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
  DEFAULT_BASE_URL,
  SEARCH_ENDPOINTS,
  normalizeOfficePlusKind,
  normalizeSearchResult,
  getOfficePlusDownloadUrl,
  searchOfficePlusComponents,
  _private: {
    buildHeaders,
    downloadEndpointFor,
    inferReuseHint,
    normalizeDownloadUrlResult,
    sanitizeDeviceId,
    sanitizeSearchBody
  }
};
