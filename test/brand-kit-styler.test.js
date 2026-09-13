"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyBrandKitStyling,
  assertBrandKit,
  calculateLuminance,
  colorDistance,
  parseHexColor,
  retargetColor
} = require("../packages/slideclone-core/brand-kit-styler");

test("parseHexColor correctly converts #RGB and #RRGGBB", () => {
  assert.deepEqual(parseHexColor("#FFF"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHexColor("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseHexColor("#0969DA"), { r: 9, g: 105, b: 218 });
  assert.deepEqual(parseHexColor("abc"), { r: 170, g: 187, b: 204 });
  assert.equal(parseHexColor("invalid"), null);
  assert.equal(parseHexColor("#12G"), null);
  assert.equal(parseHexColor("#12345Z"), null);
});

test("calculateLuminance computes perceptual brightness", () => {
  const white = calculateLuminance({ r: 255, g: 255, b: 255 });
  const black = calculateLuminance({ r: 0, g: 0, b: 0 });
  assert.equal(white, 1.0);
  assert.equal(black, 0.0);
});

test("assertBrandKit validates structure and populates defaults", () => {
  const kit = assertBrandKit({
    id: "acme-corp",
    name: "Acme Corporation",
    palette: {
      primary: "#E63946",
      secondary: "#1D3557",
      accent: "#A8DADC",
      background: "#F1FAEE",
      surface: "#FFFFFF",
      textPrimary: "#1D3557",
      textMuted: "#457B9D"
    },
    typography: {
      headingFont: "PingFang SC",
      bodyFont: "PingFang SC"
    }
  });

  assert.equal(kit.id, "acme-corp");
  assert.equal(kit.palette.primary, "#E63946");
  assert.equal(kit.palette.accent, "#A8DADC");
  assert.equal(kit.typography.headingFont, "PingFang SC");

  assert.throws(() => assertBrandKit(null), /must be an object/);
  assert.throws(() => assertBrandKit({ palette: null }), /palette must be an object/);
});

test("assertBrandKit normalizes defaults and rejects unsafe explicit fields", () => {
  const kit = assertBrandKit({
    palette: {
      primary: "#c0392b"
    },
    typography: {}
  });
  assert.equal(kit.id, "default_brand");
  assert.equal(kit.name, "Default Brand");
  assert.equal(kit.palette.primary, "#C0392B");
  assert.equal(kit.palette.secondary, "#1F2328");
  assert.equal(kit.typography.headingFont, "Microsoft YaHei");

  assert.throws(() => assertBrandKit({
    palette: { primary: "#12G" }
  }), /brand kit\.palette\.primary must be a #RGB or #RRGGBB hex color/);
  assert.throws(() => assertBrandKit({
    id: "brand\nprivate-token",
    palette: {}
  }), /brand kit\.id must be a single-line string/);
  assert.throws(() => assertBrandKit({
    palette: {},
    typography: []
  }), /brand kit\.typography must be an object/);
  assert.throws(() => assertBrandKit({
    palette: {},
    typography: { headingFont: "Source Han\nprivate-token" }
  }), /brand kit\.typography\.headingFont must be a single-line string/);
  assert.throws(() => assertBrandKit({
    name: "x".repeat(121),
    palette: {}
  }), /brand kit\.name must be at most 120 characters/);
});

test("retargetColor maps dark, light, and colored tones onto palette", () => {
  const palette = {
    primary: "#E63946",
    secondary: "#1D3557",
    accent: "#A8DADC",
    background: "#F1FAEE",
    surface: "#FFFFFF",
    textPrimary: "#1D3557",
    textMuted: "#457B9D"
  };

  // Near white -> background/surface
  assert.equal(retargetColor("#FAFAFA", palette), "#F1FAEE");

  // Text color mapping
  assert.equal(retargetColor("#000000", palette, true), "#1D3557");
  assert.equal(retargetColor("#FFFFFF", palette, true), "#FFFFFF");
});

test("applyBrandKitStyling re-themes shapes and textBoxes without mutating inputs", () => {
  const brandKit = {
    palette: {
      primary: "#D90429",
      secondary: "#2B2D42",
      accent: "#EF233C",
      background: "#EDF2F4",
      surface: "#FFFFFF",
      textPrimary: "#2B2D42",
      textMuted: "#8D99AE"
    },
    typography: {
      headingFont: "Alibaba PuHuiTi",
      bodyFont: "Alibaba PuHuiTi"
    }
  };

  const shapes = [
    { id: "s1", type: "rectangle", fill: "#0000FF", stroke: "#000000" }
  ];
  const textBoxes = [
    { role: "title", text: "季度战略", font: { color: "#111111", sizePt: 20 } },
    { role: "body", text: "核心工作事项", font: { color: "#555555", sizePt: 12 } }
  ];

  const result = applyBrandKitStyling(shapes, textBoxes, brandKit);

  assert.equal(result.shapes.length, 1);
  assert.equal(result.textBoxes.length, 2);

  // Shape colors retargeted
  assert.ok(result.shapes[0].fill);
  assert.ok(result.shapes[0].stroke);

  // Fonts and colors applied
  assert.equal(result.textBoxes[0].font.fontFamily, "Alibaba PuHuiTi");
  assert.equal(result.textBoxes[0].font.color, "#2B2D42");
  assert.equal(result.textBoxes[1].font.fontFamily, "Alibaba PuHuiTi");
  assert.equal(shapes[0].fill, "#0000FF");
  assert.equal(textBoxes[0].font.fontFamily, undefined);
});
