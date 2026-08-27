#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const REQUIRED_ALERTS = Object.freeze([
  "CommonToolsApiUnavailable",
  "CommonToolsServerErrors",
  "CommonToolsQueueBacklog",
  "CommonToolsOldestQueuedJob",
  "CommonToolsProcessingBacklog",
  "CommonToolsLeaseRecovery",
  "CommonToolsWorkerUnavailable",
  "CommonToolsRetentionMaintenanceUnavailable"
]);

function sourceText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 256 * 1024) throw new Error(`${label} is invalid`);
  return value.replace(/\r\n/g, "\n");
}
function durationSeconds(value) {
  const match = /^(\d+)([smhd])$/.exec(value || "");
  if (!match) return null;
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  const seconds = Number(match[1]) * multiplier;
  return Number.isSafeInteger(seconds) ? seconds : null;
}
function parseAlertRules(source) {
  const rules = [];
  const lines = sourceText(source, "Prometheus alert rules").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const alert = /^\s*- alert: ([A-Za-z][A-Za-z0-9]{2,127})\s*$/.exec(lines[index]);
    if (!alert) continue;
    const rule = { alert: alert[1], labels: {}, annotations: {} };
    for (index += 1; index < lines.length && !/^\s*- alert: /.test(lines[index]); index += 1) {
      const field = /^\s{8}(expr|for): (.+)\s*$/.exec(lines[index]);
      if (field) { rule[field[1]] = field[2]; continue; }
      const section = /^\s{8}(labels|annotations):\s*$/.exec(lines[index]);
      if (!section) continue;
      const target = rule[section[1]];
      for (index += 1; index < lines.length; index += 1) {
        const entry = /^\s{10}([a-z][a-z0-9_-]{0,63}): (.+)\s*$/.exec(lines[index]);
        if (!entry) { index -= 1; break; }
        target[entry[1]] = entry[2];
      }
    }
    index -= 1;
    rules.push(rule);
  }
  return rules;
}
function boundedThreshold(expression, pattern, lower, upper) {
  const match = pattern.exec(expression || "");
  if (!match) return false;
  const threshold = Number(match[1]);
  return Number.isFinite(threshold) && threshold >= lower && threshold <= upper;
}
function validExpression(alert, expression) {
  if (alert === "CommonToolsApiUnavailable") return expression === 'up{job="common-tools-api"} == 0';
  if (alert === "CommonToolsServerErrors") return boundedThreshold(expression, /^sum\(rate\(common_tools_http_requests_total\{route="mcp",status=~"5\.\."\}\[5m\]\)\) > (\d+(?:\.\d+)?)$/, 0.001, 100);
  if (alert === "CommonToolsQueueBacklog") return boundedThreshold(expression, /^sum by \(capability\) \(common_tools_queue_messages\{state="ready"\}\) > (\d+)$/, 1, 1000000);
  if (alert === "CommonToolsOldestQueuedJob") return boundedThreshold(expression, /^max by \(capability\) \(common_tools_oldest_queued_job_seconds\) > (\d+)$/, 60, 86400);
  if (alert === "CommonToolsProcessingBacklog") return boundedThreshold(expression, /^sum by \(capability\) \(common_tools_queue_messages\{state="processing"\}\) > (\d+)$/, 1, 1000000);
  if (alert === "CommonToolsLeaseRecovery") return boundedThreshold(expression, /^sum by \(capability\) \(common_tools_lease_recovery_events\{window_seconds="900"\}\) > (\d+)$/, 0, 1000000);
  if (alert === "CommonToolsWorkerUnavailable") return expression === "max by (capability) (common_tools_worker_heartbeat_active) == 0";
  if (alert === "CommonToolsRetentionMaintenanceUnavailable") return expression === "common_tools_retention_maintenance_healthy == 0";
  return false;
}
function assertAlertRules(source) {
  const rules = parseAlertRules(source);
  if (rules.length !== REQUIRED_ALERTS.length || new Set(rules.map((rule) => rule.alert)).size !== rules.length || [...rules.map((rule) => rule.alert)].sort().join(",") !== [...REQUIRED_ALERTS].sort().join(",")) throw new Error("Prometheus alert rules are incomplete");
  for (const rule of rules) {
    const seconds = durationSeconds(rule.for);
    if (!validExpression(rule.alert, rule.expr) || seconds === null || seconds < 60 || seconds > 3600 || Object.keys(rule.labels).join(",") !== "severity" || !["warning", "page"].includes(rule.labels.severity) || Object.keys(rule.annotations).sort().join(",") !== "runbook,summary" || rule.annotations.runbook !== "docs/team-docker-deployment.md#运行与灾备演练" || !rule.annotations.summary || rule.annotations.summary.length > 160) throw new Error(`Prometheus alert rule is invalid: ${rule.alert}`);
  }
  if (/(?:token|password|secret|webhook|pagerduty|email)\s*:/i.test(source)) throw new Error("Prometheus alert rules must not contain credentials or notification endpoints");
  return Object.freeze({ alerts: Object.freeze([...REQUIRED_ALERTS]) });
}
function assertPrometheusConfig(source) {
  const config = sourceText(source, "Prometheus configuration");
  const required = [
    "scrape_interval: 15s",
    "scrape_timeout: 10s",
    "- /etc/prometheus/common-tools-alerts.yaml",
    "- job_name: common-tools-api",
    "metrics_path: /metrics",
    "credentials_file: /run/secrets/common_tools_metrics_token",
    "- remote-mcp:3000"
  ];
  if (required.some((line) => !config.includes(line)) || !/^global:\n[\s\S]*^scrape_configs:\n/m.test(config) || /(?:bearer_token|authorization:\s*\n\s*credentials:|https?:\/\/|(?:^|\n)\s*-\s+[A-Za-z0-9.-]+:\d+)/m.test(config.replace("- remote-mcp:3000", ""))) throw new Error("Prometheus scrape configuration is invalid");
  return true;
}
function assertObservabilityCompose(source) {
  const compose = sourceText(source, "observability Compose configuration");
  const required = [
    'profiles: ["team-observability"]',
    "source: ./prometheus/prometheus.yaml",
    "source: ./prometheus/common-tools-alerts.yaml",
    "common_tools_metrics_token:",
    "file: ${COMMON_TOOLS_METRICS_TOKEN_FILE:?set metrics token secret file}",
    '"127.0.0.1:${COMMON_TOOLS_PROMETHEUS_PORT:-59090}:9090"',
    "remote-mcp: { condition: service_healthy }"
  ];
  const secretMounts = (compose.match(/^\s+- common_tools_metrics_token\s*$/gm) || []).length;
  const directMetricsToken = /^\s+COMMON_TOOLS_METRICS_TOKEN:\s*\S+/m.test(compose);
  if (required.some((line) => !compose.includes(line)) || secretMounts !== 2 || directMetricsToken) throw new Error("observability Compose configuration is invalid");
  return true;
}
function verifyObservabilityConfig(root = REPOSITORY_ROOT) {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("observability repository root is invalid");
  const prometheus = fs.readFileSync(path.join(root, "deploy", "prometheus", "prometheus.yaml"), "utf8");
  const alerts = fs.readFileSync(path.join(root, "deploy", "prometheus", "common-tools-alerts.yaml"), "utf8");
  const compose = fs.readFileSync(path.join(root, "deploy", "compose.team-observability.yaml"), "utf8");
  assertPrometheusConfig(prometheus);
  assertObservabilityCompose(compose);
  return assertAlertRules(alerts);
}

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyObservabilityConfig())}\n`);

module.exports = { REQUIRED_ALERTS, assertAlertRules, assertObservabilityCompose, assertPrometheusConfig, durationSeconds, parseAlertRules, verifyObservabilityConfig };
