"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCliScaffoldGeneratorObjects,
  normalizeCliScaffoldGeneratorTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/lib/cli-scaffold-generator");

test("CLI scaffold generator emits thirteen semantic minimum-unit component groups", () => {
  const page = cliScaffoldPage();
  const result = createCliScaffoldGeneratorObjects(page, { widthPt: 960, heightPt: 540 });
  const textBoxes = normalizeCliScaffoldGeneratorTextBoxes(
    [...page.textBoxes, ...result.textBoxes],
    result.matched,
    result.layout
  );
  const componentParts = [...result.shapes, ...textBoxes]
    .filter((item) => item.source?.nativeComponentInstance === true);
  const groups = groupByComponentId(componentParts);

  assert.equal(result.matched, true);
  assert.equal(result.shapes.length, 29);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("input-arrow")).every((shape) => shape.type === "rightArrow"), true);
  assert.equal(groups.size, 13);
  assert.equal(result.shapes.every((shape) => shape.source.nativeComponentGroupId), true);
  assert.equal(componentParts.every((item) => item.source.nativeComponentMinimumUnit === "semantic-component"), true);
  assert.equal(componentParts.every((item) => item.source.nativeComponentArchetype === "cli-scaffold"), true);
  assert.equal([...groups.values()].every((parts) => parts.length >= 2), true);
  assert.equal(groups.get("cli-scaffold-component-command-0").length, 3);
  assert.equal(groups.get("cli-scaffold-component-output-0").length, 6);
  assert.equal(groups.get("cli-scaffold-component-shell").length, 2);
  assert.equal(groups.get("cli-scaffold-component-warning").length, 2);
  assert.equal(textBoxes.find((item) => item.text === "init").font.sizePt, 19.5);
  assert.equal(textBoxes.find((item) => item.text === "配置").font.sizePt, 18.8);
  assert.equal(textBoxes.find((item) => item.text === "业务系统 A").font.sizePt, 19);
  assert.deepEqual(textBoxes.find((item) => item.text === "配置").box, result.layout.moduleBoxes[0]);
  assert.deepEqual(textBoxes.find((item) => item.text === "业务系统 A").box, result.layout.outputBoxes[0]);
  assert.equal(textBoxes.find((item) => item.text.startsWith("一键初始化")).font.sizePt, 14.3);
  assert.equal(result.shapes.find((shape) => shape.source.detector.endsWith("output-route")).style.strokeWidthPt, 2.2);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("output-route")).length, 12);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("output-route")).every((shape) => shape.type === "freeform"), true);
  assert.equal(textBoxes.find((item) => item.text === "CLI 脚手架：业务域仓的标准生成器").font.sizePt, 32);
  assert.equal(textBoxes.find((item) => item.text === "!").font.color, "#FFFFFF");
  assert.equal(textBoxes.find((item) => item.text.startsWith("一键初始化")).runs[0].font.weight, "bold");
});

test("CLI scaffold grouping leaves page title and explanatory copy independent", () => {
  const page = cliScaffoldPage();
  const result = createCliScaffoldGeneratorObjects(page, { widthPt: 960, heightPt: 540 });
  const textBoxes = normalizeCliScaffoldGeneratorTextBoxes(
    [...page.textBoxes, ...result.textBoxes],
    true,
    result.layout
  );
  const independent = textBoxes.filter((item) =>
    /^CLI /.test(item.text) || /^(一键初始化|全系统扩展|PRD骨架同步|平台持续演进)/.test(item.text)
  );

  assert.equal(independent.length, 5);
  assert.equal(independent.every((item) => !item.source.nativeComponentInstance), true);
  assert.equal(independent.every((item) => !item.style.nativeComponentGroupId), true);
});

test("CLI scaffold generator samples component fills from bounded source regions", () => {
  const page = cliScaffoldPage();
  const baseline = createCliScaffoldGeneratorObjects(page, { widthPt: 960, heightPt: 540 });
  const image = solidImage(960, 540, [255, 255, 255, 255]);
  fillBoxes(image, [baseline.layout.central], [52, 126, 184, 255]);
  fillBoxes(image, baseline.layout.commandBoxes, [47, 47, 47, 255]);
  fillBoxes(image, baseline.layout.moduleBoxes, [151, 151, 151, 255]);

  const sampled = createCliScaffoldGeneratorObjects(page, { widthPt: 960, heightPt: 540 }, { sourceImage: image });

  assert.deepEqual(sampled.palette, { container: "#347EB8", command: "#2F2F2F", module: "#979797" });
  assert.equal(sampled.shapes.find((shape) => shape.id === "cli-scaffold-container").style.fill, "#347EB8");
});

test("CLI scaffold generator rejects incomplete evidence before claiming a page", () => {
  const page = cliScaffoldPage();
  page.textBoxes = page.textBoxes.filter((item) => item.text !== "业务系统C");

  const result = createCliScaffoldGeneratorObjects(page, { widthPt: 960, heightPt: 540 });

  assert.equal(result.matched, false);
  assert.deepEqual(result.shapes, []);
  assert.deepEqual(result.textBoxes, []);
});

function groupByComponentId(items) {
  const groups = new Map();
  for (const item of items) {
    const groupId = item.source.nativeComponentGroupId;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(item);
  }
  return groups;
}

function cliScaffoldPage() {
  const textBoxes = [
    text("title", "CLI脚手架：业务域仓的标准生成器", 230, 50, 500, 42),
    text("command-0", "init", 70, 150, 120, 28),
    text("command-1", "add-system", 70, 210, 120, 28),
    text("command-2", "sync-prds", 70, 270, 120, 28),
    text("command-3", "upgrade", 70, 330, 120, 28),
    text("shell", "域仓模板", 435, 150, 100, 28),
    text("module-0", "配置", 350, 220, 60, 28),
    text("module-1", "菜单", 545, 220, 60, 28),
    text("module-2", "文档", 350, 295, 60, 28),
    text("module-3", "原型", 545, 295, 60, 28),
    text("output-0", "业务系统A", 790, 165, 100, 28),
    text("output-1", "业务系统B", 790, 245, 100, 28),
    text("output-2", "业务系统C", 790, 325, 100, 28),
    text("copy-0", "一键初始化：告别繁琐搭建，极速生成开箱即用的标准产品域仓。", 190, 410, 600, 20),
    text("copy-1", "全系统扩展：动态新增业务系统，系统菜单结构即平台底层资产目录。", 190, 435, 600, 20),
    text("copy-2", "PRD骨架同步：系统变更自动触发PRD骨架生成，确保代码与文档同步。", 190, 460, 600, 20),
    text("copy-3", "平台持续演进：核心能力集中化升级，各业务域零成本继承最新特性。", 190, 485, 600, 20)
  ];
  return { pageIndex: 10, textBoxes, images: [{ id: "diagram-underlay" }] };
}

function text(id, value, x, y, w, h) {
  return { id, type: "text", text: value, box: { x, y, w, h }, style: {}, source: {} };
}

function solidImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    for (let channel = 0; channel < 4; channel += 1) rgba[offset + channel] = color[channel];
  }
  return { width, height, rgba };
}

function fillBoxes(image, boxes, color) {
  for (const box of boxes) {
    for (let y = Math.floor(box.y); y < Math.ceil(box.y + box.h); y += 1) {
      for (let x = Math.floor(box.x); x < Math.ceil(box.x + box.w); x += 1) {
        const offset = (y * image.width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) image.rgba[offset + channel] = color[channel];
      }
    }
  }
}
