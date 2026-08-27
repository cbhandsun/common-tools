"use strict";

const readline = require("node:readline/promises");
const { containsControlCharacter } = require("../capability-contracts");
const { EXPERIENCE_SCENARIOS } = require("./experience-evidence");

const STANDARD_EXPERIENCE_SCENARIOS = Object.freeze(["first-visit", "core-flow", "state-feedback", "responsive", "keyboard"]);

const AUDIT_LEVEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    code: "1",
    id: "quick",
    label: "快速审计",
    coverageStrategy: "changed-and-critical",
    evidenceExpectation: "static candidate evidence plus critical-path gaps",
    requiredExperienceScenarios: Object.freeze([]),
    requiresRuntimeGates: false,
    description: "面向日常检查和变更评审，优先新增内容、核心入口与高风险问题"
  }),
  Object.freeze({
    code: "2",
    id: "standard",
    label: "标准审计",
    coverageStrategy: "representative-journeys",
    evidenceExpectation: "representative journey, state, viewport, and related code evidence",
    requiredExperienceScenarios: STANDARD_EXPERIENCE_SCENARIOS,
    requiresRuntimeGates: true,
    description: "面向版本验收，抽样核心流程、关键状态、桌面与移动体验（推荐）"
  }),
  Object.freeze({
    code: "3",
    id: "deep",
    label: "深度审计",
    coverageStrategy: "risk-driven-comprehensive",
    evidenceExpectation: "risk-driven comprehensive runtime, accessibility, security, and delivery evidence",
    requiredExperienceScenarios: EXPERIENCE_SCENARIOS,
    requiresRuntimeGates: true,
    description: "面向重大版本或高风险系统，按风险展开完整验证"
  })
]);

const AUDIT_LEVEL_BY_TOKEN = new Map(AUDIT_LEVEL_DEFINITIONS.flatMap((definition) => [
  [definition.code, definition],
  [definition.id, definition]
]));

function parseAuditLevel(value) {
  if (value === undefined) return AUDIT_LEVEL_BY_TOKEN.get("standard");
  if (typeof value !== "string") throw new TypeError("audit level must be quick, standard, deep, or a numbered choice");
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 32 || containsControlCharacter(normalized)) throw new TypeError("audit level is invalid");
  const selected = AUDIT_LEVEL_BY_TOKEN.get(normalized);
  if (!selected) throw new TypeError("audit level must use choice 1 to 3 or quick, standard, deep");
  return selected;
}

function auditLevelPlan(value) {
  const selected = parseAuditLevel(value);
  return Object.freeze({
    level: selected.id,
    label: selected.label,
    coverageStrategy: selected.coverageStrategy,
    evidenceExpectation: selected.evidenceExpectation,
    requiredExperienceScenarios: selected.requiredExperienceScenarios,
    requiresRuntimeGates: selected.requiresRuntimeGates
  });
}

function renderAuditLevelMenu() {
  return [
    "请选择审计层级：",
    ...AUDIT_LEVEL_DEFINITIONS.map((definition) => `  ${definition.code}. ${definition.label}：${definition.description}`),
    "层级只决定审计深度，不授权运行浏览器、项目门禁或远程上传。"
  ].join("\n");
}

async function promptAuditLevel({ input = process.stdin, output = process.stdout, ask } = {}) {
  if (!output || typeof output.write !== "function") throw new TypeError("audit level output is invalid");
  output.write(`${renderAuditLevelMenu()}\n`);
  if (ask !== undefined && typeof ask !== "function") throw new TypeError("audit level prompt is invalid");
  if (ask === undefined && (!input || input.isTTY !== true || output.isTTY !== true)) throw new Error("interactive audit level selection requires a TTY; use --level");
  const terminal = ask === undefined ? readline.createInterface({ input, output }) : null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = ask ? await ask("请输入编号: ") : await terminal.question("请输入编号: ");
      try { return parseAuditLevel(answer).id; }
      catch (error) {
        if (attempt === 2) throw error;
        output.write("输入无效，请选择 1、2、3 或对应层级名称。\n");
      }
    }
  } finally {
    if (terminal) terminal.close();
  }
}

module.exports = { AUDIT_LEVEL_DEFINITIONS, auditLevelPlan, parseAuditLevel, promptAuditLevel, renderAuditLevelMenu };
