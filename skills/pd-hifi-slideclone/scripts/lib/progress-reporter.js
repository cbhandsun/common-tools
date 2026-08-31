"use strict";

const SAFE_FIELDS = new Set([
  "scope",
  "phase",
  "status",
  "deck",
  "deckIndex",
  "deckTotal",
  "page",
  "pageIndex",
  "pageTotal",
  "elapsedMs",
  "images",
  "shapes",
  "textBoxes",
  "cached",
  "jobs"
]);
const NUMERIC_DIAGNOSTIC_FIELDS = new Set(["launchAttempt", "attempts", "retries", "retryDelayMs"]);

function createProgressReporter(options = {}) {
  const enabled = options.enabled !== false;
  const stream = options.stream && typeof options.stream.write === "function" ? options.stream : process.stderr;
  const baseContext = sanitizeEvent(options.context || {});
  return {
    enabled,
    emit(event = {}) {
      if (!enabled) return false;
      const payload = sanitizeEvent({ ...baseContext, ...event });
      if (!payload.phase || !payload.status) return false;
      stream.write(`[slideclone-progress] ${JSON.stringify(payload)}\n`);
      return true;
    },
    child(context = {}) {
      return createProgressReporter({ enabled, stream, context: { ...baseContext, ...sanitizeEvent(context) } });
    }
  };
}

function sanitizeEvent(event) {
  const result = {};
  for (const [key, value] of Object.entries(event && typeof event === "object" ? event : {})) {
    if (NUMERIC_DIAGNOSTIC_FIELDS.has(key)) {
      if (Number.isSafeInteger(value) && value >= 0 && value <= 86400000) result[key] = value;
      continue;
    }
    if (!SAFE_FIELDS.has(key) || value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) result[key] = Math.max(0, Math.round(value));
    } else {
      result[key] = redactSecrets(String(value)).slice(0, 120);
    }
  }
  return result;
}

function redactSecrets(value) {
  return value
    .replace(/(?:bearer\s+)[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|api[_-]?key|secret|password|cookie|license)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]");
}

function createProgressLineForwarder(options = {}) {
  const stream = options.stream && typeof options.stream.write === "function" ? options.stream : process.stderr;
  const maxBufferedChars = clampPositiveInt(options.maxBufferedChars, 16 * 1024);
  let buffer = "";
  return {
    write(chunk) {
      buffer += String(chunk || "");
      if (buffer.length > maxBufferedChars) buffer = buffer.slice(-maxBufferedChars);
      drain(false);
    },
    flush() {
      drain(true);
    }
  };

  function drain(flushRemainder) {
    const lines = buffer.split(/\r?\n/);
    buffer = flushRemainder ? "" : lines.pop() || "";
    if (flushRemainder && lines.at(-1) === "") lines.pop();
    for (const line of lines) forwardProgressLine(line, stream);
    if (flushRemainder && buffer) forwardProgressLine(buffer, stream);
  }
}

function forwardProgressLine(line, stream) {
  const prefix = "[slideclone-progress] ";
  if (!String(line || "").startsWith(prefix)) return false;
  try {
    const payload = sanitizeEvent(JSON.parse(String(line).slice(prefix.length)));
    if (!payload.phase || !payload.status) return false;
    stream.write(`${prefix}${JSON.stringify(payload)}\n`);
    return true;
  } catch {
    return false;
  }
}

function clampPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 1024 * 1024) : fallback;
}

module.exports = {
  createProgressLineForwarder,
  createProgressReporter,
  redactSecrets,
  sanitizeEvent
};
