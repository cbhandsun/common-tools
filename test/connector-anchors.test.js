"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const visionFlowDiagramRules = require("../skills/pd-hifi-slideclone/scripts/adapters/vision-flow-diagram-rules");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

const flowAdapterFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "adapters", "vision-flow-diagram-rules.js");
const pythonGeneratorFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "python", "build_pptx.py");

test("flow adapter emits semantic connector anchors for key flow lines", async () => {
  const metrics = {};
  const result = await visionFlowDiagramRules({
    pageIndex: 0,
    page: { widthPx: 2667, heightPx: 1488, regionProposals: [] },
    slideSize: { widthPt: 960, heightPt: 540 }
  }, { metrics });

  assert.equal(result.ok, true);
  const shapes = result.data.shapes;
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));

  assert.deepEqual(byId.get("left-prd-to-engine").style.startAnchor, {
    elementId: "left-prd",
    side: "right",
    position: 0.49
  });
  assert.deepEqual(byId.get("left-prd-to-engine").style.endAnchor, {
    elementId: "engine",
    side: "left",
    position: 0.42
  });
  assert.equal(byId.get("engine-to-ui-arrow").style.startAnchor.elementId, "engine");
  assert.equal(byId.get("engine-to-ui-arrow").style.endAnchor.elementId, "ui-card");
  assert.equal(byId.get("card-lower-to-portal").style.connectorType, "elbow");
  assert.equal(byId.get("card-lower-to-portal").style.endAnchor.elementId, "portal-button");
  assert.equal(byId.get("card-lower-to-portal").source.component, "connector-component-library");
  assert.deepEqual(byId.get("card-lower-to-portal").source.semanticConnector, {
    fromId: "doc-card",
    toId: "portal-button",
    direction: "forward",
    axis: "free"
  });
  assert.deepEqual(metrics.connectorSemantics, { connectors: 6, expectations: 6, findings: 0, axisTolerance: 1 });
  assert.deepEqual(
    byId.get("engine-to-doc-lower-arrow").source.connectorAnchors,
    {
      startAnchor: { elementId: "engine", side: "right", position: 0.77 },
      endAnchor: { elementId: "doc-card", side: "left", position: 0.77 }
    }
  );
});

test("python pptx generator resolves connector anchors from page elements", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /def anchor_point\(anchor, shape_index, fallback_x, fallback_y\):/);
  assert.match(source, /style\.get\("startAnchor"\)/);
  assert.match(source, /style\.get\("endAnchor"\)/);
  assert.match(source, /def page_shape_index\(page\):/);
  assert.match(source, /for collection_name in \("shapes", "images", "tables", "textBoxes"\):/);
  assert.match(source, /position = clamp_number\(anchor\.get\("position"\), 0\.5, 0, 1\)/);
});

test("python pptx generator preserves hidden OCR text as transparent editable text", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /def effective_text_opacity\(item\):/);
  assert.match(source, /style\.get\("visibility", ""\).*== "hidden"/);
  assert.match(source, /style\.get\("opacity"\) is not None/);
  assert.match(source, /\(item\.get\("font"\) or \{\}\)\.get\("opacity", 1\)/);
  assert.match(source, /effective_font = \{\*\*font, "opacity": effective_text_opacity\(item\)\}/);
  assert.match(source, /apply_run_font\(run, effective_font\)/);
});

test("python pptx generator writes textbox rotation", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /if item\.get\("rotation"\) is not None:/);
  assert.match(source, /shape\.rotation = float\(item\.get\("rotation"\)\)/);
});

test("python pptx generator applies fill styles to freeform and polyline shapes", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /elif \(item\.get\("type"\) or ""\)\.lower\(\) in \("freeform", "polyline"\):/);
  assert.match(source, /shape = builder\.convert_to_shape\(emu\(box\["x"\]\), emu\(box\["y"\]\)\)/);
  assert.match(source, /if \(item\.get\("type"\) or ""\)\.lower\(\) != "line":\s+apply_shape_fill\(shape, style\)/s);
  assert.match(source, /def apply_shape_fill\(shape, style\):/);
});

test("python pptx generator writes alpha for native shape fills and strokes", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /def apply_solid_fill_opacity\(shape, style\):/);
  assert.match(source, /def apply_line_opacity\(shape, style\):/);
  assert.match(source, /def opacity_value\(style, specific_key\):/);
  assert.match(source, /opacity_value\(style, "fillOpacity"\)/);
  assert.match(source, /opacity_value\(style, "strokeOpacity"\)/);
  assert.match(source, /style\.get\(specific_key\) is not None/);
  assert.match(source, /set_alpha_node\(srgb, alpha_value\)/);
  assert.match(source, /alpha\.set\("val", str\(int\(clamp_float\(alpha_value, 0, 1\) \* 100000\)\)\)/);
});

test("python pptx generator keeps polyline freeform paths open", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /builder\.add_line_segments\(local_points\[1:\], close=should_close_freeform\(item, style\)\)/);
  assert.match(source, /def should_close_freeform\(item, style\):/);
  assert.match(source, /if \(item\.get\("type"\) or ""\)\.lower\(\) == "polyline":\s+return False/s);
  assert.match(source, /if style\.get\("closePath"\) is not None:\s+return bool\(style\.get\("closePath"\)\)/s);
});

test("python pptx generator writes native arc shape adjustments", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /if kind == "arc":\s+return MSO_SHAPE\.ARC/s);
  assert.match(source, /if kind in \("blockarc", "block-arc"\):\s+return MSO_SHAPE\.BLOCK_ARC/s);
  assert.match(source, /if kind in \("bentarrow", "bent-arrow"\):\s+return MSO_SHAPE\.BENT_ARROW/s);
  assert.match(source, /if kind in \("leftrightarrow", "left-right-arrow"\):\s+return MSO_SHAPE\.LEFT_RIGHT_ARROW/s);
  assert.match(source, /if kind in \("curvedrightarrow", "curved-right-arrow"\):\s+return MSO_SHAPE\.CURVED_RIGHT_ARROW/s);
  assert.match(source, /def apply_shape_adjustments\(shape, style\):/);
  assert.match(source, /adjustments = style\.get\("adjustments"\)/);
  assert.match(source, /if not isinstance\(adjustments, list\):\s+return/s);
  assert.match(source, /shape\.adjustments\[index\] = float\(value\)/);
  assert.match(source, /apply_shape_adjustments\(shape, style\)/);
});

test("python pptx generator writes native DrawingML gradient fills", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /def add_gradient_fill\(shape, gradient\):/);
  assert.match(source, /OxmlElement\("a:gradFill"\)/);
  assert.match(source, /OxmlElement\("a:gsLst"\)/);
  assert.match(source, /OxmlElement\("a:lin"\)/);
  assert.match(source, /style\.get\("gradient"\)/);
  assert.match(source, /remove_fill_nodes\(sp_pr\)/);
});

test("python pptx generator writes native line dash and bidirectional arrows", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /if style\.get\("dash"\):\s+add_line_dash\(shape, style\.get\("dash"\)\)/s);
  assert.match(source, /def add_line_dash\(shape, dash_type\):/);
  assert.match(source, /OxmlElement\("a:prstDash"\)/);
  assert.match(source, /if style\.get\("endArrow"\):\s+add_line_end\(shape, style\.get\("endArrow"\), "tailEnd"\)/s);
  assert.match(source, /if style\.get\("startArrow"\):\s+add_line_end\(shape, style\.get\("startArrow"\), "headEnd"\)/s);
});

test("python pptx generator orders shape and table overlay images explicitly", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /table_overlay_images = \[/);
  assert.match(source, /if item\.get\("source", \{\}\)\.get\("tableOverlay"\) is True/);
  assert.match(source, /if not item\.get\("drawAfterShapes"\) and item not in table_overlay_images/);
  assert.match(source, /if item\.get\("drawAfterShapes"\) and item not in table_overlay_images/);
  assert.match(source, /for item in trailing_images:\s+add_picture\(slide, item, base\)/s);
  assert.match(source, /for item in page\.get\("tables", \[\]\):\s+add_table\(slide, item\)\s+for item in table_overlay_images:\s+add_picture\(slide, item, base\)\s+for item in page\.get\("textBoxes", \[\]\):/s);
});

test("python pptx generator applies crop metadata to images", () => {
  const source = fs.readFileSync(pythonGeneratorFile, "utf8");

  assert.match(source, /style = item\.get\("style"\) or \{\}/);
  assert.match(source, /apply_picture_crop\(picture, style\.get\("crop"\)\)/);
  assert.match(source, /def apply_picture_crop\(picture, crop\):/);
  assert.match(source, /"left": "crop_left"/);
  assert.match(source, /"top": "crop_top"/);
  assert.match(source, /"right": "crop_right"/);
  assert.match(source, /"bottom": "crop_bottom"/);
  assert.match(source, /max\(0\.0, min\(1\.0, float\(crop\.get\(key\)\)\)\)/);
});

test("flow adapter vectorizes detected icons and skips blank icon crops", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-icon-vector-"));
  const sourceImage = path.join(tempDir, "source.png");
  writePng(sourceImage, iconSourceImage());

  const result = await visionFlowDiagramRules({
    pageIndex: 0,
    sourceImage,
    page: { widthPx: 267, heightPx: 149, regionProposals: [] },
    slideSize: { widthPt: 960, heightPt: 540 }
  }, { outputDir: tempDir });

  assert.equal(result.ok, true);
  const gemShape = result.data.shapes.find((shape) => shape.id === "banner-gem-gem-main");
  assert.equal(gemShape.type, "diamond");
  assert.equal(gemShape.source.editable, true);
  assert.equal(gemShape.source.vectorization, "native-shape-icon-approximation");
  assert.equal(gemShape.source.iconMatch, "library-alias");
  assert.equal(result.data.images.some((image) => image.id.includes("engine-wand")), false);
});

test("flow adapter uses an icon library matcher instead of hard-coded branch checks", () => {
  const source = fs.readFileSync(flowAdapterFile, "utf8");

  assert.match(source, /const ICON_LIBRARY = \[/);
  assert.match(source, /function matchIconLibrary\(iconId\)/);
  assert.match(source, /aliases: \["gem", "diamond", "宝石"\]/);
  assert.doesNotMatch(source, /iconId\.includes\("gem"\).*iconId\.includes\("wand"\).*iconId\.includes\("camera"\)/s);
});

function iconSourceImage() {
  const width = 267;
  const height = 149;
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = 255;
    rgba[index + 1] = 255;
    rgba[index + 2] = 255;
    rgba[index + 3] = 255;
  }
  for (let y = 28; y < 35; y += 1) {
    for (let x = 15; x < 22; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
    }
  }
  return { width, height, rgba };
}
