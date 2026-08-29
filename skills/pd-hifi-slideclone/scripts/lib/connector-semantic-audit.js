"use strict";

const MAX_CONNECTORS = 5000;
const DIRECTIONS = new Set(["forward", "bidirectional", "undirected"]);
const AXES = new Set(["horizontal", "vertical", "free"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedId(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[\0\r\n]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function finitePoint(value, label) {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates`);
  }
  return { x: value.x, y: value.y };
}

function normalizeConnector(value, index) {
  if (!isRecord(value)) throw new TypeError(`connector ${index + 1} must be an object`);
  return {
    id: boundedId(value.id, `connector ${index + 1} id`),
    fromId: boundedId(value.fromId, `connector ${index + 1} fromId`),
    toId: boundedId(value.toId, `connector ${index + 1} toId`),
    arrowAtSource: value.arrowAtSource === true,
    arrowAtTarget: value.arrowAtTarget === true,
    start: finitePoint(value.start, `connector ${index + 1} start`),
    end: finitePoint(value.end, `connector ${index + 1} end`),
  };
}

function normalizeExpectation(value, index) {
  if (!isRecord(value)) throw new TypeError(`expectation ${index + 1} must be an object`);
  const direction = value.direction ?? "forward";
  const axis = value.axis ?? "free";
  if (!DIRECTIONS.has(direction)) throw new TypeError(`expectation ${index + 1} direction is invalid`);
  if (!AXES.has(axis)) throw new TypeError(`expectation ${index + 1} axis is invalid`);
  return {
    id: boundedId(value.id, `expectation ${index + 1} id`),
    fromId: boundedId(value.fromId, `expectation ${index + 1} fromId`),
    toId: boundedId(value.toId, `expectation ${index + 1} toId`),
    direction,
    axis,
  };
}

function directionMatches(connector, expectation) {
  if (expectation.direction === "undirected") return !connector.arrowAtSource && !connector.arrowAtTarget;
  if (expectation.direction === "bidirectional") return connector.arrowAtSource && connector.arrowAtTarget;
  return !connector.arrowAtSource && connector.arrowAtTarget;
}

function axisDelta(connector, axis) {
  if (axis === "horizontal") return Math.abs(connector.start.y - connector.end.y);
  if (axis === "vertical") return Math.abs(connector.start.x - connector.end.x);
  return 0;
}

function auditConnectorSemantics(connectors, expectations, options = {}) {
  if (!Array.isArray(connectors) || !Array.isArray(expectations)) throw new TypeError("connectors and expectations must be arrays");
  if (connectors.length > MAX_CONNECTORS || expectations.length > MAX_CONNECTORS) throw new RangeError("connector semantic audit input exceeds the safety limit");
  if (!isRecord(options)) throw new TypeError("connector semantic audit options must be an object");
  const axisTolerance = options.axisTolerance ?? 2;
  if (!Number.isFinite(axisTolerance) || axisTolerance < 0 || axisTolerance > 100) throw new RangeError("axisTolerance must be between 0 and 100");

  const normalized = connectors.map(normalizeConnector);
  const expected = expectations.map(normalizeExpectation);
  const byId = new Map();
  for (const connector of normalized) {
    if (byId.has(connector.id)) throw new TypeError(`duplicate connector id: ${connector.id}`);
    byId.set(connector.id, connector);
  }

  const findings = [];
  for (const expectation of expected) {
    const connector = byId.get(expectation.id);
    if (!connector) {
      findings.push({ code: "connector-missing", connectorId: expectation.id });
      continue;
    }
    if (connector.fromId !== expectation.fromId || connector.toId !== expectation.toId) {
      findings.push({ code: "connector-endpoints-reversed-or-mismatched", connectorId: connector.id, expectedFrom: expectation.fromId, expectedTo: expectation.toId, actualFrom: connector.fromId, actualTo: connector.toId });
    }
    if (!directionMatches(connector, expectation)) {
      findings.push({ code: "connector-arrow-direction-mismatch", connectorId: connector.id, expectedDirection: expectation.direction, arrowAtSource: connector.arrowAtSource, arrowAtTarget: connector.arrowAtTarget });
    }
    const delta = axisDelta(connector, expectation.axis);
    if (delta > axisTolerance) {
      findings.push({ code: "connector-axis-drift", connectorId: connector.id, expectedAxis: expectation.axis, delta, tolerance: axisTolerance });
    }
  }

  return {
    passed: findings.length === 0,
    checks: expected.length,
    metrics: { connectors: normalized.length, expectations: expected.length, findings: findings.length, axisTolerance },
    findings,
  };
}

function auditConnectorShapes(shapes, options = {}) {
  if (!Array.isArray(shapes)) throw new TypeError("connector shapes must be an array");
  if (shapes.length > MAX_CONNECTORS * 4) throw new RangeError("connector shape input exceeds the safety limit");
  const connectors = [];
  const expectations = [];
  for (const [index, shape] of shapes.entries()) {
    const semantic = shape?.source?.semanticConnector;
    if (semantic === undefined) continue;
    if (!isRecord(semantic)) throw new TypeError(`connector shape ${index + 1} semantic metadata must be an object`);
    const box = shape?.box;
    if (!isRecord(box) || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) {
      throw new TypeError(`connector shape ${index + 1} must contain finite box coordinates`);
    }
    const id = boundedId(shape.id, `connector shape ${index + 1} id`);
    const fromId = boundedId(semantic.fromId, `connector shape ${index + 1} fromId`);
    const toId = boundedId(semantic.toId, `connector shape ${index + 1} toId`);
    const direction = semantic.direction ?? "forward";
    const axis = semantic.axis ?? "free";
    connectors.push({
      id,
      fromId,
      toId,
      arrowAtSource: Boolean(shape.style?.startArrow),
      arrowAtTarget: Boolean(shape.style?.endArrow),
      start: { x: box.x, y: box.y },
      end: { x: box.x + box.w, y: box.y + box.h },
    });
    expectations.push({ id, fromId, toId, direction, axis });
  }
  return auditConnectorSemantics(connectors, expectations, options);
}

module.exports = { auditConnectorSemantics, auditConnectorShapes };
