"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");
const { createIrPreviewHtml } = require("../packages/ppt-create-core/ir-editor");

function interactiveDeck() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      shapes: [],
      images: [],
      icons: [],
      tables: [{ id: "table", type: "table", box: { x: 40, y: 40, w: 400, h: 180 }, rows: [["Metric", "Value"], ["Revenue", "12"]], style: {} }],
      charts: [{ id: "chart", type: "column", box: { x: 480, y: 40, w: 400, h: 180 }, categories: ["Q1", "Q2"], series: [{ name: "Revenue", values: [12, 18] }], style: {} }]
    }]
  };
}

function createInteractiveDom() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(createIrPreviewHtml(interactiveDeck()), {
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.TextEncoder = TextEncoder;
      window.CSS = { escape: (value) => String(value).replace(/[^A-Za-z0-9_-]/gu, (character) => `\\${character}`) };
      window.URL.createObjectURL = () => "blob:bounded-test";
      window.URL.revokeObjectURL = () => {};
      window.HTMLElement.prototype.setPointerCapture = () => {};
      window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
      window.HTMLDialogElement.prototype.close = function close() {
        this.open = false;
        this.dispatchEvent(new window.Event("close"));
      };
    }
  });
  return { dom, errors };
}

function submit(window, form) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

test("semantic editor performs controlled table and chart interactions with validation and undo", { timeout: 60000 }, () => {
  const { dom, errors } = createInteractiveDom();
  const { document } = dom.window;
  try {
    const table = document.querySelector('[data-object-id="table"]');
    table.click();
    assert.equal(document.getElementById("editTable").disabled, false);
    document.getElementById("editTable").click();
    let dialog = document.querySelector("dialog.semantic-editor");
    assert.equal(dialog.open, true);
    const revenueCell = dialog.querySelector('input[aria-label="第 2 行，第 2 列"]');
    revenueCell.value = "24";
    submit(dom.window, dialog.querySelector("form"));
    assert.equal(document.querySelector('[data-object-id="table"]').rows[1].cells[1].textContent, "24");
    assert.match(document.getElementById("count").textContent, /^1 \/ 500 项待保存变更$/u);
    document.getElementById("undo").click();
    assert.equal(document.querySelector('[data-object-id="table"]').rows[1].cells[1].textContent, "12");
    document.getElementById("redo").click();
    assert.equal(document.querySelector('[data-object-id="table"]').rows[1].cells[1].textContent, "24");

    const chart = document.querySelector('[data-object-id="chart"]');
    chart.click();
    assert.equal(document.getElementById("editChart").disabled, false);
    document.getElementById("editChart").click();
    dialog = document.querySelector("dialog.semantic-editor");
    const chartType = dialog.querySelector("select");
    const categories = dialog.querySelector("textarea");
    const seriesName = dialog.querySelector('.chart-series input[aria-label$="名称"]');
    const seriesValues = dialog.querySelector('.chart-series input[aria-label$="数值"]');
    chartType.value = "line";
    categories.value = "Only one";
    submit(dom.window, dialog.querySelector("form"));
    assert.equal(document.querySelector("dialog.semantic-editor"), dialog);
    assert.match(document.getElementById("count").textContent, /2–12/u);

    categories.value = "Q1\nQ2\nQ3";
    seriesName.value = "Revenue";
    seriesValues.value = "12, 18, 24";
    submit(dom.window, dialog.querySelector("form"));
    assert.equal(document.querySelector("dialog.semantic-editor"), null);
    assert.equal(chart.querySelector("strong").textContent, "line chart");
    assert.equal(chart.querySelector("span").textContent, "Revenue: 12, 18, 24");
    assert.match(document.getElementById("count").textContent, /^2 \/ 500 项待保存变更$/u);
    document.getElementById("undo").click();
    assert.equal(chart.querySelector("strong").textContent, "column chart");
    assert.equal(chart.querySelector("span").textContent, "Revenue: 12, 18");
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
