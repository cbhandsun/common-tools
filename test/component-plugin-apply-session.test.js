"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectInventoryRoots,
  parseArgs,
  renderActionGuide,
  runPluginApplySession,
  selectActions,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-plugin-apply-session");

function makeQueue() {
  return {
    provider: "component-plugin-action-queue-v1",
    actions: [
      {
        order: 1,
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-11189",
        title: "蓝色简约圆通用4项中心总分PPT组件",
        score: 98,
        acquisitionMode: "plugin-auth-required",
        fileName: "4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx",
        paymentType: "member",
        price: "9.9",
        downloadLookup: {
          status: "auth-required",
          httpStatus: 401,
          url: "https://example.invalid/secret?token=should-not-leak"
        },
        targetMotifs: ["radial-link"],
        affectedTargets: [{
          deck: "Deck_A",
          slide: 3,
          imageId: "matrix-underlay",
          imageIndex: 0,
          layerKey: "Deck_A:p3:matrix-underlay"
        }],
        affectedSlides: [{ deck: "Deck_A", slide: 3 }],
        suitability: {
          score: 96,
          tier: "strong",
          reasons: ["editable-grouped-component", "radial-center"],
          rejectionReasons: []
        },
        action: {
          tab: "OfficePLUS",
          library: "component",
          searchText: "中心辐射",
          expectedCandidateId: "MatlComponentContent-11189",
          expectedTitle: "蓝色简约圆通用4项中心总分PPT组件",
          instruction: "Open OfficePLUS and apply the component."
        }
      },
      {
        order: 2,
        provider: "islide",
        kind: "smartdiagram",
        id: "islide-77",
        title: "中心发散关系图",
        score: 76,
        targetMotifs: ["radial-link"],
        action: {
          tab: "iSlide",
          library: "smartdiagram",
          searchText: "中心关系",
          expectedCandidateId: "islide-77",
          expectedTitle: "中心发散关系图",
          instruction: "Open iSlide and apply the component."
        }
      }
    ]
  };
}

test("component plugin apply session parses bounded arguments", () => {
  const args = parseArgs([
    "node",
    "component-plugin-apply-session.js",
    "--queue",
    "queue.json",
    "--out",
    "runs/session",
    "--action-order",
    "2",
    "--max-actions",
    "5",
    "--duration-ms",
    "250",
    "--poll-ms",
    "100",
    "--watch-provider",
    "officeplus",
    "--watch-root",
    "C:/OfficePLUS/Temp",
    "--active-powerpoint",
    "--inventory-root",
    "runs/components",
    "--learn-structure",
    "--no-default-roots",
    "--no-learn-structure"
  ]);

  assert.equal(args.queue, "queue.json");
  assert.equal(args.out, "runs/session");
  assert.deepEqual(args.actionOrders, [2]);
  assert.equal(args.maxActions, 5);
  assert.equal(args.durationMs, 250);
  assert.equal(args.pollMs, 100);
  assert.equal(args.watchProvider, "officeplus");
  assert.deepEqual(args.watchRoots, ["C:/OfficePLUS/Temp"]);
  assert.equal(args.activePowerPoint, true);
  assert.deepEqual(args.inventoryRoots, ["runs/components"]);
  assert.equal(args.includeDefaultRoots, false);
  assert.equal(args.learnStructure, false);
});

test("component plugin apply session accepts explicit learn-structure flag", () => {
  const args = parseArgs([
    "node",
    "component-plugin-apply-session.js",
    "--queue",
    "queue.json",
    "--learn-structure"
  ]);

  assert.equal(args.learnStructure, true);
});

test("component plugin apply session selects explicit or top-ranked actions", () => {
  const queue = makeQueue();

  assert.deepEqual(selectActions(queue, { maxActions: 1 }).map((action) => action.order), [1]);
  assert.deepEqual(selectActions(queue, { actionOrders: [2] }).map((action) => action.provider), ["islide"]);
  assert.equal(_private.inferWatchProvider(selectActions(queue, { maxActions: 2 })), "all");
  assert.equal(_private.inferWatchProvider(selectActions(queue, { maxActions: 1 })), "officeplus");
});

test("component plugin apply session renders a bounded plugin guide", () => {
  const guide = renderActionGuide({
    queueFile: "queue.json",
    actions: selectActions(makeQueue(), { maxActions: 1 }),
    watchProvider: "officeplus",
    durationMs: 1000,
    activePowerPoint: true
  });

  assert.match(guide, /Plugin Component Apply Session/);
  assert.match(guide, /中心辐射/);
  assert.match(guide, /OfficePLUS/);
  assert.match(guide, /Watch active PowerPoint file: yes/);
  assert.match(guide, /Active Slide Harvest/);
  assert.match(guide, /Suitability: strong \(96\)/);
  assert.match(guide, /Acquisition mode: plugin-auth-required/);
  assert.match(guide, /Source file: 4a962dae-0adb-0e87-8cac-3a19c1222a49\.pptx/);
  assert.match(guide, /Payment type: member/);
  assert.match(guide, /Price: 9\.9/);
  assert.match(guide, /Download lookup: auth-required \(401\)/);
  assert.doesNotMatch(guide, /should-not-leak|token=/);
  assert.match(guide, /Suitability reasons: editable-grouped-component, radial-center/);
  assert.match(guide, /harvest-active-powerpoint-component\.js/);
  assert.match(guide, /--provider officeplus --label MatlComponentContent-11189/);
  assert.match(guide, /Active-slide harvest after apply/);
});

test("component plugin apply session builds safe per-action active harvest commands", () => {
  const command = _private.activeSlideHarvestCommand({
    provider: "islide",
    id: "",
    kind: "smartdiagram",
    order: 2,
    title: "中心发散关系图 / 4项"
  });

  assert.match(command, /--provider islide/);
  assert.match(command, /--label islide-smartdiagram-action-2/);
  assert.doesNotMatch(command, /中心/);
  assert.equal(_private.sanitizeHarvestLabel("MatlComponentContent-11189"), "MatlComponentContent-11189");
  assert.doesNotMatch(_private.sanitizeHarvestLabel("x".repeat(79) + "-tail"), /-$/);
});

test("component plugin apply session carries safe acquisition metadata", () => {
  const [action] = selectActions(makeQueue(), { maxActions: 1 });

  assert.deepEqual(action.acquisition, {
    mode: "plugin-auth-required",
    sourceFile: "4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx",
    fileName: "4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx",
    paymentType: "member",
    price: "9.9",
    downloadLookup: {
      status: "auth-required",
      httpStatus: 401
    }
  });
  assert.deepEqual(action.affectedSlides, [{ deck: "Deck_A", slide: 3 }]);
  assert.equal(action.affectedTargets[0].imageId, "matrix-underlay");
  assert.deepEqual(_private.renderAcquisitionLines(action.acquisition), [
    "Acquisition mode: plugin-auth-required",
    "Source file: 4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx",
    "Payment type: member",
    "Price: 9.9",
    "Download lookup: auth-required (401)"
  ]);
  assert.equal(JSON.stringify(action).includes("should-not-leak"), false);
});

test("component plugin apply session summarizes target motif fulfillment from inventory coverage", () => {
  const fulfillment = _private.summarizeSessionFulfillment({
    actions: selectActions(makeQueue(), { maxActions: 1 }),
    inventory: {
      summary: {
        byStructureMotif: {
          "radial-link": 2
        }
      }
    }
  });

  assert.equal(fulfillment.provider, "component-plugin-apply-session-fulfillment-v1");
  assert.deepEqual(fulfillment.targetMotifs, ["radial-link"]);
  assert.equal(fulfillment.fulfilled, 1);
  assert.equal(fulfillment.pending, 0);
  assert.equal(fulfillment.rows[0].status, "fulfilled");
  assert.equal(fulfillment.rows[0].structureMatches, 2);
});

test("component plugin apply session report summaries keep target motifs", () => {
  const action = selectActions(makeQueue(), { maxActions: 1 })[0];
  const summary = _private.summarizeAction(action);

  assert.deepEqual(summary.targetMotifs, ["radial-link"]);
  assert.equal(summary.affectedTargets[0].deck, "Deck_A");
});

test("component plugin apply session marks target motifs pending when inventory has no structure coverage", () => {
  const fulfillment = _private.summarizeSessionFulfillment({
    actions: selectActions(makeQueue(), { maxActions: 1 }),
    inventory: {
      summary: {
        byStructureMotif: {}
      }
    }
  });

  assert.equal(fulfillment.fulfilled, 0);
  assert.equal(fulfillment.pending, 1);
  assert.equal(fulfillment.rows[0].status, "pending");
});

test("component plugin apply session watches plugin output and refreshes inventory", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-apply-session-"));
  const queue = path.join(tmp, "queue.json");
  const officeRoot = path.join(tmp, "OfficePLUS", "Temp");
  const out = path.join(tmp, "out");
  fs.mkdirSync(officeRoot, { recursive: true });
  fs.writeFileSync(queue, `${JSON.stringify(makeQueue())}\n`, "utf8");

  setTimeout(() => {
    writeEmptyZip(path.join(officeRoot, "MatlComponentContent-11189.pptx"));
  }, 80);

  const report = await runPluginApplySession({
    queue,
    out,
    actionOrders: [1],
    durationMs: 250,
    pollMs: 50,
    watchProvider: "officeplus",
    watchRoots: [officeRoot],
    includeDefaultRoots: false,
    learnStructure: false,
    maxTotalFiles: 10
  });

  assert.equal(report.actions.length, 1);
  assert.equal(report.watch.changedCount, 1);
  assert.equal(report.inventory.summary.total, 1);
  assert.equal(report.inventory.summary.byProvider.officeplus, 1);
  assert.equal(report.fulfillment.pending, 1);
  assert.equal(report.fulfillment.rows[0].motif, "radial-link");
  assert.equal(fs.existsSync(path.join(out, "plugin-action-guide.md")), true);
  assert.equal(fs.existsSync(path.join(out, "component-inventory.json")), true);
});

function writeEmptyZip(file) {
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  fs.writeFileSync(file, endOfCentralDirectory);
}

test("component plugin apply session collects existing watched inventory roots", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-apply-roots-"));
  const watched = path.join(tmp, "watched");
  const islide = path.join(watched, "islide");
  fs.mkdirSync(islide, { recursive: true });

  const roots = collectInventoryRoots({
    explicitRoots: [path.join(tmp, "missing")],
    watchedRoot: watched,
    watchReport: {
      harvests: [{ outRoot: islide }]
    }
  });

  assert.deepEqual(roots, [islide]);
});
