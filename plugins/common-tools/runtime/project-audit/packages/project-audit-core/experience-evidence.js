"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");

const MAX_EVIDENCE_FILE_BYTES = 256 * 1024;
const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;
const EXPERIENCE_SCENARIOS = Object.freeze(["first-visit", "core-flow", "result-followup", "state-feedback", "recovery", "responsive", "keyboard", "console-network"]);
const EXPERIENCE_STATUSES = new Set(["passed", "failed", "not-verified"]);
const EVIDENCE_KINDS = new Set(["screenshot", "recording", "console", "network"]);

function relativeEvidencePath(value) {
  if (typeof value !== "string" || !value || value.length > 512 || path.isAbsolute(value) || value.includes("\\")) throw new TypeError("experience evidence path is invalid");
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../")) throw new TypeError("experience evidence path is invalid");
  return normalized;
}

function readExperienceEvidence(projectRoot, source) {
  if (typeof source !== "string" || !source.trim()) throw new TypeError("experience evidence is required");
  const file = insideRoot(projectRoot, path.resolve(projectRoot, source));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_EVIDENCE_FILE_BYTES) throw new Error("experience evidence file is invalid");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("experience evidence file is not valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "scenarios,schemaVersion" || value.schemaVersion !== 1 || !Array.isArray(value.scenarios) || value.scenarios.length > EXPERIENCE_SCENARIOS.length) throw new Error("experience evidence schema is invalid");
  const seen = new Set();
  const scenarios = value.scenarios.map((scenario) => normalizeScenario(projectRoot, scenario, seen));
  return Object.freeze({ schemaVersion: 1, scenarios: Object.freeze(scenarios) });
}

function createExperienceEvidenceTemplate(projectRoot, output) {
  if (typeof output !== "string" || !output.trim()) throw new TypeError("experience evidence output is required");
  const file = insideRoot(projectRoot, path.resolve(projectRoot, output));
  if (path.extname(file).toLowerCase() !== ".json") throw new Error("experience evidence output must be a JSON file");
  if (fs.existsSync(file)) throw new Error("experience evidence output already exists");
  const parent = path.dirname(file);
  const relativeParent = path.relative(fs.realpathSync.native(projectRoot), parent);
  if (relativeParent === ".." || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) throw new Error("experience evidence output is outside the approved root");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const template = Object.freeze({ schemaVersion: 1, scenarios: Object.freeze(EXPERIENCE_SCENARIOS.map((id) => Object.freeze({ id, status: "not-verified", evidence: Object.freeze([]) }))) });
  fs.writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return Object.freeze({ file, scenarioIds: EXPERIENCE_SCENARIOS });
}

function normalizeScenario(projectRoot, value, seen) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "evidence,id,status" || typeof value.id !== "string" || !EXPERIENCE_SCENARIOS.includes(value.id) || seen.has(value.id) || !EXPERIENCE_STATUSES.has(value.status) || !Array.isArray(value.evidence) || value.evidence.length > 8) throw new Error("experience scenario is invalid");
  if (value.status !== "not-verified" && value.evidence.length === 0) throw new Error("verified experience scenario requires captured evidence");
  seen.add(value.id);
  const evidence = value.evidence.map((item) => normalizeEvidence(projectRoot, item));
  return Object.freeze({ id: value.id, status: value.status, evidence: Object.freeze(evidence) });
}

function normalizeEvidence(projectRoot, value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "file,kind" || !EVIDENCE_KINDS.has(value.kind)) throw new Error("experience capture is invalid");
  const file = relativeEvidencePath(value.file);
  const captured = insideRoot(projectRoot, path.resolve(projectRoot, file));
  const stat = fs.lstatSync(captured);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_CAPTURE_BYTES) throw new Error("experience capture file is invalid");
  return Object.freeze({ file, line: 1, rule: `experience-${value.kind}` });
}

function experienceReviewFinding(experience, applicable, { requiredScenarioIds = EXPERIENCE_SCENARIOS } = {}) {
  if (!Array.isArray(requiredScenarioIds) || new Set(requiredScenarioIds).size !== requiredScenarioIds.length || requiredScenarioIds.some((id) => !EXPERIENCE_SCENARIOS.includes(id))) throw new TypeError("required experience scenarios are invalid");
  if (!applicable) return { id: "experience-review", passed: true, severity: "info", assessment: "not-applicable", message: "not applicable to the detected project profile", evidence: [] };
  if (!experience && requiredScenarioIds.length === 0) return { id: "experience-review", passed: true, severity: "info", assessment: "not-applicable", message: "runtime experience evidence is not required for the selected quick audit level", evidence: [] };
  if (!experience) return { id: "experience-review", passed: false, severity: "info", assessment: "not-verified", message: `${requiredScenarioIds.length} required experience scenario(s) are not verified for the selected audit level`, evidence: [] };
  const byId = new Map(experience.scenarios.map((scenario) => [scenario.id, scenario]));
  const effectiveRequiredIds = requiredScenarioIds.length ? requiredScenarioIds : experience.scenarios.map((scenario) => scenario.id);
  const missing = effectiveRequiredIds.filter((id) => !byId.has(id));
  const failed = [...byId.values()].filter((scenario) => scenario.status === "failed");
  const unverified = effectiveRequiredIds.map((id) => byId.get(id)).filter((scenario) => scenario?.status === "not-verified");
  const evidence = [...byId.values()].flatMap((scenario) => scenario.evidence).slice(0, 25);
  const passed = missing.length === 0 && failed.length === 0 && unverified.length === 0;
  const verified = effectiveRequiredIds.filter((id) => byId.get(id)?.status === "passed").length;
  const assessment = passed ? "observed" : failed.length ? "missing" : "not-verified";
  const severity = passed ? "info" : failed.length ? "warn" : "info";
  return { id: "experience-review", passed, severity, assessment, message: `${verified}/${effectiveRequiredIds.length} required experience scenario(s) verified; ${failed.length} failed, ${unverified.length + missing.length} not verified`, evidence };
}

module.exports = { EXPERIENCE_SCENARIOS, createExperienceEvidenceTemplate, experienceReviewFinding, readExperienceEvidence };
