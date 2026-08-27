"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { REQUIRED_ALERTS, assertAlertRules, assertObservabilityCompose, assertPrometheusConfig, verifyObservabilityConfig } = require("../scripts/verify-observability-config");

const ROOT = path.resolve(__dirname, "..");
const alerts = fs.readFileSync(path.join(ROOT, "deploy", "prometheus", "common-tools-alerts.yaml"), "utf8");
const prometheus = fs.readFileSync(path.join(ROOT, "deploy", "prometheus", "prometheus.yaml"), "utf8");
const compose = fs.readFileSync(path.join(ROOT, "deploy", "compose.team-observability.yaml"), "utf8");

test("observability contract retains an internal authenticated scrape and all required alerts", () => {
  assert.deepEqual(verifyObservabilityConfig(ROOT), { alerts: REQUIRED_ALERTS });
  assert.equal(assertPrometheusConfig(prometheus), true);
  assert.equal(assertObservabilityCompose(compose), true);
  assert.deepEqual(assertAlertRules(alerts), { alerts: REQUIRED_ALERTS });
});

test("observability contract rejects missing alert coverage, unsafe scrape targets, and notification material", () => {
  assert.throws(() => assertAlertRules(alerts.replace("CommonToolsWorkerUnavailable", "CommonToolsWorkerMissing")), /incomplete/);
  assert.throws(() => assertPrometheusConfig(prometheus.replace("- remote-mcp:3000", "- telemetry.example.test:443")), /invalid/);
  assert.throws(() => assertAlertRules(`${alerts}\n      webhook: https://pager.example.test`), /must not contain/);
  assert.throws(() => assertObservabilityCompose(compose.replace("source: ./prometheus/prometheus.yaml", "source: ./prometheus/other.yaml")), /invalid/);
  assert.throws(() => assertObservabilityCompose(`${compose}\n      COMMON_TOOLS_METRICS_TOKEN: must-not-be-committed`), /invalid/);
});
