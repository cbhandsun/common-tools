"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createReviewStudioServer } = require("../skills/pd-hifi-slideclone/scripts/lib/review-studio-server");

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-studio-"));
  const sourceFile = path.join(directory, "page.png");
  fs.writeFileSync(sourceFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const irFile = path.join(directory, "deck.ir.json");
  fs.writeFileSync(irFile, `${JSON.stringify({
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "page.png",
      background: { fill: "#FFFFFF" },
      textBoxes: [{
        id: "title",
        role: "title",
        text: "Before",
        box: { x: 20, y: 30, w: 400, h: 60 },
        font: { family: "Arial", sizePt: 32, color: "#111111", align: "left", secretFontPath: "C:/secret/font.ttf" },
        style: { fill: "#FFFFFF", assetPath: "C:/secret/underlay.png" },
        source: { pageImage: "page.png", evidenceBox: { x: 20, y: 30, w: 400, h: 60 }, editable: true }
      }],
      shapes: [], images: [], tables: [], charts: [], icons: []
    }]
  }, null, 2)}\n`, "utf8");
  return { directory, irFile, sourceFile };
}

async function withServer(run) {
  const fixture = createFixture();
  const instance = createReviewStudioServer({ irFile: fixture.irFile, baseDir: fixture.directory, token: "a".repeat(64), maxBodyBytes: 2048 });
  await new Promise((resolve) => instance.server.listen(0, "127.0.0.1", resolve));
  const address = instance.server.address();
  try { await run({ ...fixture, ...instance, url: `http://127.0.0.1:${address.port}` }); }
  finally { await new Promise((resolve) => instance.server.close(resolve)); fs.rmSync(fixture.directory, { recursive: true, force: true }); }
}

test("review studio exposes a sanitized model and allowlisted source image", async () => {
  await withServer(async ({ url }) => {
    const modelResponse = await fetch(`${url}/api/deck`);
    assert.equal(modelResponse.status, 200);
    assert.match(modelResponse.headers.get("content-security-policy"), /default-src 'self'/);
    const payload = await modelResponse.json();
    assert.match(payload.revision, /^[a-f0-9]{64}$/);
    assert.equal(payload.deck.pages[0].elements[0].id, "title");
    assert.equal(payload.deck.pages[0].sourceImage, undefined);
    assert.equal(payload.deck.pages[0].elements[0].source, undefined);
    assert.equal(payload.deck.pages[0].elements[0].style.assetPath, undefined);
    assert.equal(payload.deck.pages[0].elements[0].font.secretFontPath, undefined);
    const sourceResponse = await fetch(`${url}/api/pages/0/source`);
    assert.equal(sourceResponse.status, 200);
    assert.equal(sourceResponse.headers.get("content-type"), "image/png");
    assert.equal((await sourceResponse.arrayBuffer()).byteLength, 4);
    assert.equal((await fetch(`${url}/api/pages/999/source`)).status, 404);
    assert.equal((await fetch(`${url}/api/pages/0/source/../../deck.ir.json`)).status, 404);
  });
});

test("review studio requires its CSRF token and rejects non-allowlisted changes", async () => {
  await withServer(async ({ url, token }) => {
    const { revision } = await (await fetch(`${url}/api/deck`)).json();
    const patch = { revision, patches: [{ pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { text: "Changed" } }] };
    const noToken = await fetch(`${url}/api/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    assert.equal(noToken.status, 403);
    const badOrigin = await fetch(`${url}/api/apply`, { method: "POST", headers: { "Content-Type": "application/json", "X-Review-Token": token, Origin: "https://attacker.invalid" }, body: JSON.stringify(patch) });
    assert.equal(badOrigin.status, 403);
    const pathAttempt = await fetch(`${url}/api/apply`, { method: "POST", headers: { "Content-Type": "application/json", "X-Review-Token": token }, body: JSON.stringify({ revision, patches: [{ pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { assetPath: "../../secret" } }] }) });
    assert.equal(pathAttempt.status, 400);
  });
});

test("review studio atomically applies patches, creates backup, and omits text from audit", async () => {
  await withServer(async ({ url, token, irFile, directory }) => {
    const { revision } = await (await fetch(`${url}/api/deck`)).json();
    const response = await fetch(`${url}/api/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Review-Token": token },
      body: JSON.stringify({ revision, patches: [{ operationId: "safe-op", pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { text: "Sensitive reviewer content", box: { x: 55 }, review: { status: "accepted" } } }] })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.applied, 1);
    assert.equal(payload.receipt.backupCreated, true);
    const saved = JSON.parse(fs.readFileSync(irFile, "utf8"));
    assert.equal(saved.pages[0].textBoxes[0].text, "Sensitive reviewer content");
    assert.equal(saved.pages[0].textBoxes[0].box.x, 55);
    const backupDirectory = path.join(directory, ".review-backups");
    const files = fs.readdirSync(backupDirectory);
    assert.ok(files.some((file) => file.endsWith(".json") && file !== "review-audit.jsonl"));
    const audit = fs.readFileSync(path.join(backupDirectory, "review-audit.jsonl"), "utf8");
    assert.doesNotMatch(audit, /Sensitive reviewer content/);
    assert.match(audit, /"fields":\["box","review","text"\]/);
  });
});

test("review studio enforces bounded JSON request bodies", async () => {
  await withServer(async ({ url, token }) => {
    const response = await fetch(`${url}/api/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Review-Token": token },
      body: JSON.stringify({ patches: [], padding: "x".repeat(3000) })
    });
    assert.equal(response.status, 413);
  });
});

test("review studio rejects stale writes without overwriting an external edit", async () => {
  await withServer(async ({ url, token, irFile }) => {
    const { revision } = await (await fetch(`${url}/api/deck`)).json();
    const external = JSON.parse(fs.readFileSync(irFile, "utf8"));
    external.pages[0].textBoxes[0].text = "External edit";
    fs.writeFileSync(irFile, `${JSON.stringify(external, null, 2)}\n`, "utf8");

    const response = await fetch(`${url}/api/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Review-Token": token },
      body: JSON.stringify({ revision, patches: [{ pageIndex: 0, collection: "textBoxes", elementId: "title", changes: { text: "Stale browser edit" } }] })
    });

    assert.equal(response.status, 409);
    assert.equal(JSON.parse(fs.readFileSync(irFile, "utf8")).pages[0].textBoxes[0].text, "External edit");
  });
});
