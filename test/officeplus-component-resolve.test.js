"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyAcquisitionMode,
  parseArgs,
  parseTarget,
  resolveOfficePlusComponents,
  summarizeRows,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/officeplus-component-resolve");

test("officeplus component resolve parses targets and CLI flags", () => {
  assert.deepEqual(parseTarget("MatlComponentContent-1900=渐变风流程箭头元素_4项"), {
    id: "MatlComponentContent-1900",
    keywords: "渐变风流程箭头元素_4项"
  });
  assert.deepEqual(parseTarget("MatlComponentContent-16000"), {
    id: "MatlComponentContent-16000",
    keywords: "MatlComponentContent-16000"
  });

  const args = parseArgs([
    "node",
    "officeplus-component-resolve.js",
    "--target",
    "MatlComponentContent-1900=流程箭头",
    "--targets",
    "MatlComponentContent-16000=循环箭头",
    "--out",
    "resolve.json",
    "--size",
    "4",
    "--max-download-urls",
    "2"
  ]);

  assert.equal(args.targets.length, 2);
  assert.equal(args.out, "resolve.json");
  assert.equal(args.size, 4);
  assert.equal(args.maxDownloadUrls, 2);
});

test("officeplus component resolve classifies authorized download failures", async () => {
  const calls = [];
  const report = await resolveOfficePlusComponents({
    targets: [{ id: "MatlComponentContent-1900", keywords: "流程箭头" }],
    size: 3,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (String(url).includes("/search/component-content/search")) {
        return jsonResponse(200, {
          documents: [{
            id: "MatlComponentContent-1900",
            kind: "component",
            title: "渐变风流程箭头元素_4项",
            fileName: "component.pptx",
            fileSize: 75996,
            itemCount: 4,
            paymentType: 0,
            price: 0,
            keywords: ["流程", "4项"]
          }],
          total: 1
        });
      }
      return jsonResponse(401, {
        error_code: 401001,
        message: null
      });
    }
  });

  assert.equal(report.summary.targets, 1);
  assert.equal(report.summary.found, 1);
  assert.equal(report.summary.authRequired, 1);
  assert.equal(report.rows[0].bestDocument.id, "MatlComponentContent-1900");
  assert.equal(report.rows[0].downloadLookup.status, "auth-required");
  assert.equal(report.rows[0].acquisitionMode, "plugin-auth-required");
  assert.ok(calls.some((call) => call.method === "POST"));
  assert.ok(calls.some((call) => call.url.includes("/download/MatlComponentContent-1900/download-url")));
});

test("officeplus component resolve summarizes modes and direct downloads", () => {
  assert.equal(classifyAcquisitionMode({ best: null }), "missing");
  assert.equal(classifyAcquisitionMode({
    best: { id: "MatlComponentContent-1", paymentType: 0 },
    downloadLookup: { status: "ok" }
  }), "direct-download");
  assert.equal(classifyAcquisitionMode({
    best: { id: "MatlComponentContent-1", paymentType: 1, price: 8.88 },
    downloadLookup: { status: "unresolved" }
  }), "plugin-or-member-required");

  assert.deepEqual(summarizeRows([
    { bestDocument: { id: "a" }, acquisitionMode: "direct-download" },
    { bestDocument: { id: "b" }, acquisitionMode: "plugin-auth-required" },
    { bestDocument: null, acquisitionMode: "missing" }
  ]), {
    targets: 3,
    found: 2,
    directDownload: 1,
    authRequired: 1,
    byAcquisitionMode: {
      "direct-download": 1,
      "plugin-auth-required": 1,
      missing: 1
    }
  });
});

test("officeplus component resolve prefers exact id matches", () => {
  const document = _private.chooseBestDocument([
    { id: "MatlComponentContent-1", title: "other" },
    { id: "MatlComponentContent-1900", title: "target" }
  ], { id: "MatlComponentContent-1900" });

  assert.equal(document.title, "target");
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    text: async () => JSON.stringify(payload)
  };
}
