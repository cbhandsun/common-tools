"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeIslideKind,
  searchIslideContents,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/islide-search");

test("iSlide search normalizes anonymous diagram content results", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          body: {
            total: 3516,
            currentPageTotal: 1,
            items: [{
              id: "5114996",
              type: "diagram",
              uniqueId: "a7e33971-a6ad-4159-874c-cc54f430b7cb",
              title: "创意风教育答辩课件流程图PPT流程",
              thumbnail: "https://static.islide.cc/site/content/demo.thumbnail.png",
              gallery: ["https://static.islide.cc/site/content/demo.gallery.png", "file:///unsafe"],
              downloadable: false,
              group: { id: "premium", permission: "premium" },
              files: [{ key: "default", name: "default", isDefault: true }]
            }]
          }
        });
      }
    };
  };

  const result = await searchIslideContents({
    kind: "component",
    keywords: "流程",
    size: 3,
    fetchImpl
  });

  assert.match(calls[0].url, /^https:\/\/api\.islide\.cc\/v7\/contents\?/);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.accept, "application/json");
  assert.equal(new URL(calls[0].url).searchParams.get("type"), "diagram");
  assert.equal(new URL(calls[0].url).searchParams.get("keywords"), "流程");
  assert.equal(result.kind, "diagram");
  assert.equal(result.total, 3516);
  assert.equal(result.documents[0].id, "5114996");
  assert.equal(result.documents[0].coverUrl, "https://static.islide.cc/site/content/demo.thumbnail.png");
  assert.deepEqual(result.documents[0].gallery, ["https://static.islide.cc/site/content/demo.gallery.png"]);
  assert.equal(result.documents[0].reuseHint, "candidate-polished-diagram-reference");
});

test("iSlide search rejects auth-bound responses with sanitized actions", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        code: 4215,
        error: null,
        actions: [{ type: "gotoEmbedUrl", data: "{\"url\":\"https://embed.islide.cc/login\"}" }]
      });
    }
  });

  await assert.rejects(
    () => searchIslideContents({ kind: "diagram", keywords: "流程", fetchImpl }),
    /iSlide diagram search failed: 4215/
  );
});

test("iSlide search clamps and coerces external inputs", () => {
  assert.equal(normalizeIslideKind("ppt"), "template");
  assert.equal(normalizeIslideKind("smart-art"), "smartdiagram");
  assert.equal(normalizeIslideKind("unknown"), "diagram");
  assert.deepEqual(_private.sanitizeSearchQuery({
    kind: "ppt",
    start: -20,
    size: 999,
    keywords: `x${"y".repeat(100)}`
  }), {
    type: "template",
    keywords: `x${"y".repeat(79)}`,
    size: "50",
    start: "0"
  });
});
