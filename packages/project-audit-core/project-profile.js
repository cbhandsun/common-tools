"use strict";

const FRONTEND_FRAMEWORKS = new Set(["@angular/core", "@sveltejs/kit", "next", "nuxt", "preact", "react", "react-dom", "solid-js", "svelte", "vue"]);
const API_FRAMEWORKS = new Set(["@fastify/core", "@nestjs/core", "express", "fastify", "h3", "koa"]);
const AI_PACKAGES = new Set(["@ai-sdk/openai", "@langchain/core", "ai", "langchain", "openai"]);
const DATA_PACKAGES = new Set(["@supabase/supabase-js", "better-sqlite3", "duckdb", "mongodb", "mysql2", "pg", "postgres", "prisma", "redis", "sqlite3"]);

function detectProjectProfile({ files, relative, packageValue, frontendFiles = [], apiFiles = [] } = {}) {
  if (!Array.isArray(files) || typeof relative !== "function") throw new TypeError("project profile files are invalid");
  const names = new Set(files.map(relative));
  const dependencies = dependencyNames(packageValue);
  const scripts = scriptNames(packageValue);
  const traits = [];
  if (hasWorkspace(packageValue, names)) traits.push("monorepo");
  if (frontendFiles.length > 0 || hasAny(dependencies, FRONTEND_FRAMEWORKS)) traits.push("frontend");
  if (apiFiles.length > 0 || hasAny(dependencies, API_FRAMEWORKS)) traits.push("api");
  if (hasCliEntrypoint(packageValue, names)) traits.push("cli");
  if (hasPluginSurface(names)) traits.push("plugin");
  if (hasAny(dependencies, AI_PACKAGES) || pathIncludes(names, /(?:^|\/)(?:agents?|prompts?|evals?)(?:\/|$)/i)) traits.push("ai");
  if (hasAny(dependencies, DATA_PACKAGES) || pathIncludes(names, /(?:^|\/)(?:migrations?|schema|models?|repositories?)(?:\/|$)/i)) traits.push("data");
  if (scripts.has("build")) traits.push("buildable");
  if (scripts.has("test") || scripts.has("check")) traits.push("testable");
  const type = profileType(traits, dependencies, packageValue);
  return Object.freeze({ type, traits: Object.freeze([...new Set(traits)].sort()) });
}

function dependencyNames(packageValue) {
  if (!packageValue || typeof packageValue !== "object" || Array.isArray(packageValue)) return new Set();
  return new Set(Object.keys({ ...(packageValue.dependencies || {}), ...(packageValue.devDependencies || {}), ...(packageValue.peerDependencies || {}) }));
}

function scriptNames(packageValue) {
  if (!packageValue || typeof packageValue !== "object" || Array.isArray(packageValue) || !packageValue.scripts || typeof packageValue.scripts !== "object" || Array.isArray(packageValue.scripts)) return new Set();
  return new Set(Object.keys(packageValue.scripts));
}

function hasAny(values, candidates) {
  for (const value of candidates) if (values.has(value)) return true;
  return false;
}

function hasWorkspace(packageValue, names) {
  return Boolean(packageValue && typeof packageValue === "object" && !Array.isArray(packageValue) && (Array.isArray(packageValue.workspaces) || packageValue.workspaces && typeof packageValue.workspaces === "object")) || names.has("pnpm-workspace.yaml") || names.has("lerna.json") || names.has("turbo.json");
}

function hasCliEntrypoint(packageValue, names) {
  const bin = packageValue && typeof packageValue === "object" && !Array.isArray(packageValue) ? packageValue.bin : null;
  if (typeof bin === "string" || bin && typeof bin === "object" && !Array.isArray(bin) && Object.keys(bin).length > 0) return true;
  return pathIncludes(names, /(?:^|\/)(?:bin|cli)(?:\/|$)|(?:^|\/)(?:cli|main)\.[cm]?js$/i);
}

function hasPluginSurface(names) {
  return names.has(".codex-plugin/plugin.json") || names.has("plugin.json") || pathIncludes(names, /(?:^|\/)(?:plugins?|marketplaces?)(?:\/|$)/i);
}

function pathIncludes(names, expression) {
  for (const name of names) if (expression.test(name)) return true;
  return false;
}

function profileType(traits, dependencies, packageValue) {
  const values = new Set(traits);
  if (values.has("plugin")) return "plugin";
  if (values.has("frontend") && values.has("api")) return "web-application";
  if (values.has("frontend")) return "frontend-application";
  if (values.has("api")) return "api-service";
  if (values.has("cli")) return "cli-tool";
  if (values.has("ai")) return "ai-tooling";
  if (values.has("data")) return "data-tooling";
  if (dependencies.size > 0 || Boolean(packageValue)) return "library-or-tooling";
  return "repository";
}

module.exports = { detectProjectProfile };
