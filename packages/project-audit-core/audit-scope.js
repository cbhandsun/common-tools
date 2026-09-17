"use strict";

const { containsControlCharacter } = require("../capability-contracts");

const readline = require("node:readline/promises");

const AUDIT_SCOPE_DEFINITIONS = Object.freeze([
  Object.freeze({ code: "2", id: "product-journey", label: "产品闭环", aliases: Object.freeze(["product", "product-journey", "journey", "产品", "产品闭环", "产品旅程", "用户旅程", "业务闭环"]) }),
  Object.freeze({ code: "3", id: "visual-interaction", label: "视觉、交互与无障碍", aliases: Object.freeze(["visual", "interaction", "ux", "accessibility", "visual-interaction", "视觉", "交互", "无障碍", "视觉交互", "视觉交互与无障碍", "视觉、交互与无障碍"]) }),
  Object.freeze({ code: "4", id: "data-security", label: "数据、权限与可靠性", aliases: Object.freeze(["data", "security", "reliability", "data-security", "数据", "权限", "可靠性", "数据权限", "数据权限可靠性", "数据、权限与可靠性"]) }),
  Object.freeze({ code: "5", id: "engineering-delivery", label: "工程与交付", aliases: Object.freeze(["engineering", "delivery", "engineering-delivery", "工程", "交付", "工程交付", "工程与交付"]) })
]);
const AUDIT_SCOPE_IDS = Object.freeze(AUDIT_SCOPE_DEFINITIONS.map((definition) => definition.id));
const AUDIT_SCOPE_BY_TOKEN = new Map(AUDIT_SCOPE_DEFINITIONS.flatMap((definition) => [
  [definition.code, definition.id],
  [definition.id, definition.id],
  [definition.label.toLowerCase(), definition.id],
  ...definition.aliases.map((alias) => [alias.toLowerCase(), definition.id])
]));
const AUDIT_SCOPE_ALL_TOKENS = new Set(["1", "all", "全部", "全域", "全部四域", "四域", "所有", "全量"]);

function parseAuditScope(value) {
  if (value === undefined) return AUDIT_SCOPE_IDS;
  if (typeof value !== "string") throw new TypeError("audit scope must be a comma-separated string");
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || containsControlCharacter(normalized)) throw new TypeError("audit scope is invalid");
  const tokens = normalized.split(/[,，;；]/u).map((token) => token.trim().toLowerCase());
  if (tokens.some((token) => !token) || new Set(tokens).size !== tokens.length) throw new TypeError("audit scope must not contain empty or duplicate selections");
  if (tokens.some((token) => AUDIT_SCOPE_ALL_TOKENS.has(token))) {
    if (tokens.length !== 1) throw new TypeError("audit scope all must be selected by itself");
    return AUDIT_SCOPE_IDS;
  }
  const selected = tokens.map((token) => AUDIT_SCOPE_BY_TOKEN.get(token));
  if (selected.some((id) => id === undefined) || new Set(selected).size !== selected.length) throw new TypeError("audit scope must use choices 1 to 5, declared scope IDs, or Chinese/English scope names");
  return Object.freeze(AUDIT_SCOPE_IDS.filter((id) => selected.includes(id)));
}

function renderAuditScopeMenu() {
  return [
    "请选择项目审计范围：",
    "  1. 全部四域（推荐）",
    ...AUDIT_SCOPE_DEFINITIONS.map((definition) => `  ${definition.code}. ${definition.label}`),
    "可输入单个编号、中文/英文名称，或用逗号组合，例如 2,3 或 产品闭环，工程与交付。"
  ].join("\n");
}

async function promptAuditScope({ input = process.stdin, output = process.stdout, ask } = {}) {
  if (!output || typeof output.write !== "function") throw new TypeError("audit scope output is invalid");
  output.write(`${renderAuditScopeMenu()}\n`);
  if (ask !== undefined && typeof ask !== "function") throw new TypeError("audit scope prompt is invalid");
  if (ask === undefined && (!input || input.isTTY !== true || output.isTTY !== true)) throw new Error("interactive audit scope selection requires a TTY; use --scope");
  const terminal = ask === undefined ? readline.createInterface({ input, output }) : null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answer = ask ? await ask("请输入编号或名称: ") : await terminal.question("请输入编号或名称: ");
      try { return parseAuditScope(answer).join(","); }
      catch (error) {
        if (attempt === 2) throw error;
        output.write("输入无效，请选择 1，或使用 2 至 5 的逗号分隔组合。\n");
      }
    }
  } finally {
    if (terminal) terminal.close();
  }
}

module.exports = { AUDIT_SCOPE_DEFINITIONS, AUDIT_SCOPE_IDS, parseAuditScope, promptAuditScope, renderAuditScopeMenu };
