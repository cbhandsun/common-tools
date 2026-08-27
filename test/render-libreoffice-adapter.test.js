"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const renderLibreOffice = require("../skills/pd-hifi-slideclone/scripts/adapters/render-libreoffice");

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

test("collectRenderedPages returns numeric slide order and image sizes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-libreoffice-pages-"));
  try {
    fs.writeFileSync(path.join(dir, "page-10.png"), tinyPng);
    fs.writeFileSync(path.join(dir, "page-2.png"), tinyPng);
    fs.writeFileSync(path.join(dir, "page-1.png"), tinyPng);
    fs.writeFileSync(path.join(dir, "not-a-slide.png"), tinyPng);

    const pages = renderLibreOffice.collectRenderedPages(dir);

    assert.deepEqual(pages.map((page) => path.basename(page.image)), ["page-1.png", "page-2.png", "page-10.png"]);
    assert.deepEqual(pages.map((page) => page.pageIndex), [0, 1, 2]);
    assert.equal(pages[0].widthPx, 1);
    assert.equal(pages[0].heightPx, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
