"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOfficePlusDownloadUrl,
  normalizeOfficePlusKind,
  searchOfficePlusComponents,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/officeplus-search");

test("OfficePLUS search normalizes plugin component results", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          total: 1,
          documents: [{
            id: "MatlComponentContent-11617",
            title: "渐变6项流程",
            description: "渐变6项流程",
            fileName: "d3a875b0.pptx",
            fileSize: 45711,
            pageNumber: 1,
            itemCount: 6,
            resolution: "2280*954",
            coverFileName: "https://image-prod.officeplus.cn/cms-public/demo.png",
            attachments: ["https://image-prod.officeplus.cn/cms-public/attachment.png", "file:///unsafe"],
            l1Tags: [{ name: "PPT关系图" }],
            l3Tags: [{ name: "流程" }],
            keywords: ["渐变", "6项", "流程"],
            paymentType: 1,
            price: 9.9,
            score: 31.07259
          }]
        });
      }
    };
  };

  const result = await searchOfficePlusComponents({
    kind: "diagram",
    keywords: "流程",
    size: 3,
    deviceId: "5240e5be-240f-40d2-b094-0a0338e55f2c",
    fetchImpl
  });

  assert.equal(calls[0].url, "https://api.officeplus.cn/api/addin/v4.1/search/component-content/search");
  assert.equal(calls[0].options.headers.DeviceId, "5240e5be-240f-40d2-b094-0a0338e55f2c");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    start: 0,
    size: 3,
    subcategoryIds: [],
    tags: [],
    keywords: "流程"
  });
  assert.equal(result.kind, "component");
  assert.equal(result.documents[0].title, "渐变6项流程");
  assert.equal(result.documents[0].coverUrl, "https://image-prod.officeplus.cn/cms-public/demo.png");
  assert.deepEqual(result.documents[0].attachments, ["https://image-prod.officeplus.cn/cms-public/attachment.png"]);
  assert.equal(result.documents[0].reuseHint, "candidate-grouped-pptx-component");
});

test("OfficePLUS search rejects failed plugin API responses with sanitized context", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    async text() {
      return JSON.stringify({ message: "No DeviceId header provided." });
    }
  });

  await assert.rejects(
    () => searchOfficePlusComponents({ kind: "shape", keywords: "流程", fetchImpl }),
    /OfficePLUS shape search failed: 401 No DeviceId header provided/
  );
});

test("OfficePLUS download URL lookup models authenticated download boundary", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.officeplus.cn/api/addin/v3.4/download/MatlComponentContent-11617/anonymous/download-url");
    assert.equal(options.method, "GET");
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      async text() {
        return JSON.stringify({ error_code: 401001, message: null });
      }
    };
  };

  await assert.rejects(
    () => getOfficePlusDownloadUrl("MatlComponentContent-11617", {
      kind: "component",
      anonymous: true,
      deviceId: "5240e5be-240f-40d2-b094-0a0338e55f2c",
      fetchImpl
    }),
    /OfficePLUS download URL lookup failed: 401/
  );
});

test("OfficePLUS download URL lookup normalizes successful URL payloads", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ data: { downloadUrl: "https://download.officeplus.cn/demo.pptx" } });
    }
  });

  const result = await getOfficePlusDownloadUrl("VectorContent-10698", {
    kind: "vector",
    deviceId: "5240e5be-240f-40d2-b094-0a0338e55f2c",
    fetchImpl
  });

  assert.equal(result.endpoint, "/addin/v4.1/download/VectorContent-10698/download-url");
  assert.equal(result.downloadUrl, "https://download.officeplus.cn/demo.pptx");
});

test("OfficePLUS search clamps external inputs before sending to plugin API", () => {
  assert.equal(normalizeOfficePlusKind("diagram"), "component");
  assert.equal(normalizeOfficePlusKind("unknown"), "component");
  assert.equal(_private.sanitizeSearchBody({
    start: -10,
    size: 999,
    keywords: `x${"y".repeat(100)}`,
    subcategoryIds: ["a", null, "b"],
    tags: ["tag"]
  }).size, 50);
  assert.equal(_private.sanitizeSearchBody({ start: -10 }).start, 0);
  assert.equal(_private.sanitizeSearchBody({ keywords: `x${"y".repeat(100)}` }).keywords.length, 80);
});
