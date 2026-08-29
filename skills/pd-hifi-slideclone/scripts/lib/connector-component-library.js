"use strict";

const ROLES = Object.freeze({
  flow: Object.freeze({ stroke: "#424A52", strokeWidthPt: 1.6, connectorType: "curve", direction: "forward" }),
  feedback: Object.freeze({ stroke: "#59656F", strokeWidthPt: 1.45, connectorType: "curve", direction: "forward" }),
  "cycle-fixed": Object.freeze({ stroke: "#424A52", strokeWidthPt: 1.6, connectorType: "arc", direction: "forward", routeStability: "fixed-geometry" }),
  bidirectional: Object.freeze({ stroke: "#48535C", strokeWidthPt: 1.5, connectorType: "straight", direction: "bidirectional" }),
  support: Object.freeze({ stroke: "#53606A", strokeWidthPt: 1.4, connectorType: "straight", direction: "forward" }),
  memory: Object.freeze({ stroke: "#55545F", strokeWidthPt: 1.3, connectorType: "straight", direction: "bidirectional" }),
  hierarchy: Object.freeze({ stroke: "#7A838C", strokeWidthPt: 1.2, connectorType: "elbow", direction: "undirected" }),
  bus: Object.freeze({ stroke: "#697680", strokeWidthPt: 1.25, connectorType: "elbow", direction: "undirected" }),
});

const ROUTES = new Set(["straight", "curve", "arc", "elbow", "elbow-2", "elbow-3", "elbow-4"]);
const DIRECTIONS = new Set(["forward", "bidirectional", "undirected"]);
const DASHES = new Set(["solid", "dash", "dot"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalHex(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9A-F]{6}$/iu.test(value)) throw new TypeError("connector color must be a six-digit hex value");
  return value.toUpperCase();
}

function resolveConnectorComponent(input) {
  if (!isRecord(input)) throw new TypeError("connector component input must be an object");
  const role = typeof input.role === "string" ? input.role : "flow";
  const preset = ROLES[role];
  if (!preset) throw new TypeError(`unsupported connector role: ${role}`);
  const direction = input.direction ?? preset.direction;
  const connectorType = input.connectorType ?? preset.connectorType;
  const dash = input.dash ?? "solid";
  const strokeWidthPt = input.strokeWidthPt ?? preset.strokeWidthPt;
  if (!DIRECTIONS.has(direction)) throw new TypeError("connector direction is invalid");
  if (!ROUTES.has(connectorType)) throw new TypeError("connector route is invalid");
  if (!DASHES.has(dash)) throw new TypeError("connector dash is invalid");
  if (!Number.isFinite(strokeWidthPt) || strokeWidthPt < 0.5 || strokeWidthPt > 8) throw new RangeError("connector stroke width must be between 0.5 and 8 pt");
  const stroke = optionalHex(input.stroke) ?? preset.stroke;

  if (preset.routeStability === "fixed-geometry") {
    if (connectorType !== "arc") throw new TypeError("fixed cycle component route must be arc");
    if (direction !== "forward") throw new TypeError("fixed cycle component direction must be forward");
    if (dash !== "solid") throw new TypeError("fixed cycle component dash must be solid");
    return {
      role,
      type: "shape",
      style: {
        shapeType: "arc",
        stroke,
        strokeWidthPt,
        lineCap: "round",
        lineJoin: "round",
        endArrow: "triangle",
      },
      arrowhead: {
        type: "triangle",
        placement: "semantic-target",
        primitive: "native-line-end",
        editable: true,
      },
      source: {
        component: "connector-component-library",
        semanticRole: role,
        direction,
        routeStability: "fixed-geometry",
      },
    };
  }

  return {
    role,
    type: "line",
    style: {
      stroke,
      strokeWidthPt,
      connectorType,
      lineCap: "round",
      lineJoin: "round",
      ...(dash === "solid" ? {} : { dash }),
      ...(direction === "bidirectional" ? { startArrow: "triangle", endArrow: "triangle" }
        : direction === "forward" ? { endArrow: "triangle" } : {}),
    },
    source: { component: "connector-component-library", semanticRole: role, direction, routeStability: "auto-route" },
  };
}

module.exports = { CONNECTOR_COMPONENT_ROLES: Object.keys(ROLES), resolveConnectorComponent };
