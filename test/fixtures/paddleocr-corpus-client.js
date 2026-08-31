"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const adapter = require("../../skills/pd-hifi-slideclone/scripts/adapters/ocr-paddleocr-local");

async function main() {
  const context = JSON.parse(process.env.CORPUS_TEST_CONTEXT);
  delete process.env.CORPUS_TEST_CONTEXT;
  const brokerExpected = Boolean(process.env.SLIDECLONE_PADDLE_OCR_BROKER_URL);
  const result = await adapter({
    sourceImage: path.resolve(__dirname, "../../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"),
    pageIndex: 0,
    page: { widthPx: 200, heightPx: 100 },
    slideSize: { widthPt: 100, heightPt: 50 }
  }, context);
  assert.equal(result.ok, true);
  assert.equal(result.performance.broker, brokerExpected);
  assert.deepEqual(result.data.lines.map((line) => line.text), ["左侧", "右侧"]);
  process.stdout.write("corpus-client-ok\n");
}

main().catch(() => { process.stderr.write("corpus-client-failed\n"); process.exitCode = 1; })
  .finally(() => adapter.closeActiveEngine());
