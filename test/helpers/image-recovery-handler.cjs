"use strict";

const { S3Client } = require("@aws-sdk/client-s3");
const { createObjectStore } = require("../../packages/remote-mcp-server/team-providers");
const { createImageToEditableArchiveHandler } = require("../../packages/slideclone-core/team-worker");
const { boundedOcrSourceDeck } = require("../../packages/slideclone-core/team-native-rebuild");

function imageRecoveryHandler(settings) {
  const fixture = settings.imageFixture;
  return async (context) => {
    const client = new S3Client(fixture.s3.config);
    const store = createObjectStore(client, fixture.s3.bucket, 900, { readinessRetryDelaysMs: [] });
    const handler = createImageToEditableArchiveHandler({
      temporaryRoot: fixture.work,
      builderExecutable: fixture.dotnet,
      builderArgs: [fixture.builderDll],
      ...(fixture.checkpoint ? {
        ocrCheckpointFingerprint: "a".repeat(64),
        async rawImageOcr() {
          process.send({ phase: "ocr-called", attempt: context.job.attempt });
          return { lines: [{ text: "Checkpoint recovery", confidence: 0.99, box: { x: 8, y: 8, w: 100, h: 20 } }] };
        },
        async rawImageRebuilder({ metadata, ocr }) {
          process.send({ phase: "rebuilt", attempt: context.job.attempt });
          const deck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
          deck.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 4, y: 4, w: 120, h: 40 }, source: { editable: true } });
          return { deck };
        }
      } : {}),
      objectStore: {
        readObject: (input) => store.readObject(input),
        putObject: async (input) => {
          const { objectKey } = input;
          await store.putObject(input);
          process.send({ phase: objectKey.includes("/.internal/ocr/") ? "checkpoint-written" : "artifact-written", id: context.job.id, attempt: context.job.attempt, objectKey });
          if (settings.pause) await new Promise(() => {});
        }
      }
    });
    process.send({ phase: "claimed", id: context.job.id, attempt: context.job.attempt });
    try { return await handler(context); }
    finally { client.destroy(); }
  };
}

module.exports = { imageRecoveryHandler };
