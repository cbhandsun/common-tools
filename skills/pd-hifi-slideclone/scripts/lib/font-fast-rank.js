"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("./exec");
const { pythonEnv } = require("./python-env");

async function rankRoleFontOptions({ skillRoot, outputDir, ir, irFile = null, roles, topN = 2 }) {
  const inputFile = path.join(outputDir, "reports", "font-fast-rank-input.json");
  const reportFile = path.join(outputDir, "reports", "font-fast-rank-result.json");
  fs.mkdirSync(path.dirname(inputFile), { recursive: true });
  fs.writeFileSync(inputFile, `${JSON.stringify({
    ir,
    baseDir: irFile ? path.dirname(path.resolve(irFile)) : process.cwd(),
    topN,
    optionsByRole: roles
  }, null, 2)}\n`, "utf8");

  const python = process.env.PYTHON_BIN || "python";
  const script = path.join(skillRoot, "scripts", "python", "font_ranker.py");
  try {
    await run(python, [script, "--input", inputFile, "--out", reportFile], {
      cwd: outputDir,
      env: pythonEnv(skillRoot),
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024
    });
    const result = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    if (result.ok !== true) {
      return { ok: false, inputFile, reportFile, error: result.error || "font ranker returned non-ok result" };
    }
    return { ok: true, inputFile, reportFile, data: result };
  } catch (error) {
    return {
      ok: false,
      inputFile,
      reportFile,
      error: error.message,
      stderr: error.stderr || null,
      stdout: error.stdout || null
    };
  }
}

function rankedOptionsForRole(rankResult, role, fallbackOptions) {
  const ranked = rankResult?.data?.rankings?.[role];
  if (!Array.isArray(ranked) || ranked.length === 0) return fallbackOptions;
  const normalized = ranked
    .map((entry) => entry?.option)
    .filter((option) => option && typeof option === "object");
  return normalized.length ? normalized : fallbackOptions;
}

module.exports = {
  rankedOptionsForRole,
  rankRoleFontOptions
};
