"use strict";

const readline = require("readline");

const args = process.argv.slice(2);
const langIndex = args.indexOf("--lang");
const mode = langIndex >= 0 ? args[langIndex + 1] : "ch";

if (mode !== "init-hang") process.stdout.write(`${JSON.stringify({
  type: "ready",
  protocolVersion: 2,
  paddleocrVersion: "3.7.0-test",
  paddlepaddleVersion: "3.3.1-test"
})}\n`);

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (mode === "hang") return;
  if (mode === "protocol-noise") {
    process.stdout.write("PRIVATE_FIXTURE_NON_JSON\n");
    return;
  }
  if (mode === "fail") {
    process.stdout.write(`${JSON.stringify({ type: "error", id: request.id, code: "inference-failed", detail: "secret OCR text" })}\n`);
    return;
  }
  if (mode === "malformed") {
    process.stdout.write(`${JSON.stringify({ type: "result", id: request.id, itemsByImage: request.imagePaths.map(() => [{ text: "bad", confidence: 2, polygon: [] }]) })}\n`);
    return;
  }
  const items = mode === "empty" ? [] : [
    { text: "右侧", confidence: 0.91, polygon: [[80, 10], [100, 10], [100, 20], [80, 20]], orientation: 0 },
    { text: "左侧", confidence: 0.98, polygon: [[10, 10], [30, 10], [30, 20], [10, 20]], orientation: 0 }
  ];
  process.stdout.write(`${JSON.stringify({ type: "result", id: request.id, itemsByImage: request.imagePaths.map(() => items) })}\n`);
});
