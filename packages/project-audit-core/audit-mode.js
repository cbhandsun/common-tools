"use strict";

const { containsControlCharacter } = require("../capability-contracts");

const AUDIT_MODES = Object.freeze(["code", "enhanced", "gates", "experience", "full"]);

const MODE_HINTS = Object.freeze({
  full: Object.freeze([/\bfull\s+audit\b/i, /\bcomprehensive\s+audit\b/i, /完整.{0,12}(?:审视|审查|审计)/, /全面.{0,12}(?:审视|审查|审计)/, /端到端.{0,12}(?:审视|审查|审计)/]),
  experience: Object.freeze([/\b(?:user\s+journey|product\s+experience|visual|interaction|responsive|accessibility|keyboard|browser)\b/i, /(?:用户旅程|产品体验|视觉|交互|响应式|可访问性|键盘|浏览器|主链路)/]),
  gates: Object.freeze([/\b(?:run|execute)\s+(?:the\s+)?(?:gates|checks|tests|lint|build)\b/i, /(?:运行|执行)(?:.*?)(?:门禁|检查|测试|构建|lint)/]),
  code: Object.freeze([/\b(?:code|static)\s+(?:audit|review)\b/i, /(?:只做|仅做|静态|代码)(?:.{0,12})(?:审视|审查|审计)/])
});

function normalizeInstruction(value) {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new TypeError("audit instruction must be a string");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > 2000 || containsControlCharacter(normalized)) throw new TypeError("audit instruction is invalid");
  return normalized;
}

function parseAuditMode(value) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !AUDIT_MODES.includes(value.trim())) throw new TypeError("audit mode must be code, enhanced, gates, experience, or full");
  return value.trim();
}

function inferAuditMode(instruction) {
  const normalized = normalizeInstruction(instruction);
  if (!normalized) return Object.freeze({ mode: "enhanced", signals: Object.freeze([]) });
  for (const mode of ["full", "experience", "gates", "code"]) {
    const signals = MODE_HINTS[mode].filter((pattern) => pattern.test(normalized)).map((pattern) => pattern.source);
    if (signals.length) return Object.freeze({ mode, signals: Object.freeze(signals) });
  }
  return Object.freeze({ mode: "enhanced", signals: Object.freeze([]) });
}

function auditIntentPlan({ mode, instruction } = {}) {
  const explicitMode = parseAuditMode(mode);
  const inferred = inferAuditMode(instruction);
  const selectedMode = explicitMode || inferred.mode;
  const requires = [];
  if (selectedMode === "gates" || selectedMode === "full") requires.push("explicit --run-gates authorization");
  if (selectedMode === "experience" || selectedMode === "full") requires.push("experience evidence manifest created from an approved browser review");
  return Object.freeze({
    mode: selectedMode,
    selectedBy: explicitMode ? "explicit-mode" : (instruction ? "instruction" : "default"),
    signals: inferred.signals,
    requires: Object.freeze(requires),
    runsProjectCode: selectedMode === "gates" || selectedMode === "full",
    needsBrowserEvidence: selectedMode === "experience" || selectedMode === "full"
  });
}

function auditModeOptions({ mode, instruction, runGates = false, experienceEvidence } = {}) {
  if (typeof runGates !== "boolean") throw new TypeError("runGates must be a boolean");
  const plan = auditIntentPlan({ mode, instruction });
  const hasExperienceEvidence = experienceEvidence !== undefined;
  const effectiveMode = mode === undefined && instruction === undefined
    ? (runGates && hasExperienceEvidence ? "full" : runGates ? "gates" : hasExperienceEvidence ? "experience" : plan.mode)
    : plan.mode;
  const requiresGates = effectiveMode === "gates" || effectiveMode === "full";
  const requiresExperience = effectiveMode === "experience" || effectiveMode === "full";
  if (requiresGates && !runGates) throw new Error(`audit mode ${effectiveMode} requires explicit --run-gates authorization`);
  if (!requiresGates && runGates) throw new Error(`audit mode ${effectiveMode} does not allow --run-gates; use --mode gates or --mode full`);
  if (requiresExperience && (typeof experienceEvidence !== "string" || !experienceEvidence.trim())) throw new Error(`audit mode ${effectiveMode} requires --experience-evidence`);
  if (!requiresExperience && hasExperienceEvidence) throw new Error(`audit mode ${effectiveMode} does not allow --experience-evidence; use --mode experience or --mode full`);
  return Object.freeze({ mode: effectiveMode, runGates, requiresExperience, experienceEvidence: requiresExperience ? experienceEvidence.trim() : null });
}

module.exports = { AUDIT_MODES, auditIntentPlan, auditModeOptions, inferAuditMode, normalizeInstruction, parseAuditMode };
