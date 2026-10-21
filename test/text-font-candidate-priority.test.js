"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { tryBuildFinalEditableTextFontFamilyCandidate, fitDeckEditableTextFontFamily } = require("../packages/slideclone-worker-adapter/team-worker");
const { hasMeasuredVisualGain } = require("../packages/slideclone-worker-adapter/candidate-quality-policy");

test("font fitting admits the installed Noto Sans SC family without changing text or geometry", () => {
  const textBox = { id: "body", text: "content", box: { x: 20, y: 30, w: 100, h: 20 }, font: { family: "Microsoft YaHei", sizePt: 16 } };
  const deck = { pages: [{ textBoxes: [textBox] }] };
  const fitted = fitDeckEditableTextFontFamily(deck, { fontFamily: "Noto Sans SC" });
  assert.equal(fitted.changedTextBoxes, 1);
  assert.equal(fitted.deck.pages[0].textBoxes[0].font.family, "Noto Sans SC");
  assert.deepEqual(fitted.deck.pages[0].textBoxes[0].box, textBox.box);
  assert.equal(textBox.font.family, "Microsoft YaHei");
});

test("legacy font fitting replaces script channels and rich/positioned overrides even when base family already matches",()=>{
 const text={id:'body',text:'Ω漢',box:{x:10,y:10,w:60,h:20},font:{family:'DengXian',sizePt:14,eastAsianFamily:'Old CJK'},
  runs:[{text:'Ω漢',font:{family:'Old Latin',latinFamily:'Old Latin',color:'#FF0000',weight:'bold',sizePt:15}}],
  positionedRuns:[{text:'Ω漢',box:{x:10,y:10,w:60,h:20},fontOverride:{complexScriptFamily:'Old Script'}}],source:{editable:true}};
 const deck={pages:[{textBoxes:[text]}]},before=structuredClone(deck);
 const fitted=fitDeckEditableTextFontFamily(deck,{fontFamily:'DengXian'});assert.equal(fitted.changedTextBoxes,1);
 const result=fitted.deck.pages[0].textBoxes[0];
 for(const font of [result.font,result.runs[0].font,result.positionedRuns[0].fontOverride]){
  for(const key of ['family','latinFamily','eastAsianFamily','complexScriptFamily'])assert.equal(font[key],'DengXian');}
 assert.equal(result.runs[0].font.color,'#FF0000');assert.equal(result.runs[0].font.weight,'bold');assert.equal(result.runs[0].font.sizePt,15);
 assert.deepEqual(result.positionedRuns[0].box,text.positionedRuns[0].box);assert.deepEqual(deck,before);
 assert.equal(fitDeckEditableTextFontFamily(fitted.deck,{fontFamily:'DengXian'}).changedTextBoxes,0);
});

test("font search spends its first isolated candidate on visual contribution, preserving gates", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "font-priority-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = { slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ textBoxes: ["tiny", "title", "body"].map((id, i) => ({
    id, text: `${id} content`, box: { x: 20, y: i * 50, w: 200, h: 30 }, font: { family: "Microsoft YaHei", sizePt: 20 }, source: { editable: true }
  })) }] };
  const quality = { passed: false, checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14,
    "component-regions-attention": 3, "worst-component-normalized-severity": 4 }, componentWorst:
    ["tiny", "title", "body"].map((id, i) => ({ pageIndex: 0, id, kind: "text", role: "text", contributionScore: [1, 10000, 500][i] })) };
  const attempts = [];
  const result = await tryBuildFinalEditableTextFontFamilyCandidate({ root, metadata: { generatedDeck: deck }, sourceImages: [], visualQuality: quality,
    isCancellationRequested: async () => false, runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"),
    rawImageQualityVerifier: async ({ deck: candidate }) => {
      const changed = candidate.pages[0].textBoxes.filter(item => item.font.family !== "Microsoft YaHei");
      attempts.push(changed.map(item => item.id));
      const improves = changed.length === 1 && changed[0].id === "title" && changed[0].font.family === "Noto Sans SC";
      return { ...quality, metrics: { ...quality.metrics, "pixel-diff-ratio": improves ? 0.10 : 0.12,
        "foreground-missing-ratio": improves ? 0.07 : 0.09, "mean-absolute-delta": improves ? 13 : 15 } };
    }
  });
  assert.deepEqual(attempts[0], ["title"]);
  assert.equal(result.accepted, true);
  assert.equal(result.fontFamily, "Noto Sans SC");
  assert.equal(result.changedTextBoxes, 1);
  assert.ok(attempts.length <= 10);
  assert.equal(deck.pages[0].textBoxes[1].font.family, "Microsoft YaHei");
});

test("measured font gain rejects identical, invalid and incomplete metric evidence", () => {
  const baseline = { metrics: { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.05, "mean-absolute-delta": 14 } };
  assert.equal(hasMeasuredVisualGain(baseline, baseline), false);
  assert.equal(hasMeasuredVisualGain(baseline, { metrics: { ...baseline.metrics, "mean-absolute-delta": 13 } }), true);
  for (const value of [null, {}, { metrics: {} }, { metrics: { ...baseline.metrics, "pixel-diff-ratio": NaN } },
    { metrics: { ...baseline.metrics, "pixel-diff-ratio": -1 } }, { metrics: { ...baseline.metrics, "mean-absolute-delta": 256 } },
    { metrics: { ...baseline.metrics, "pixel-diff-ratio": "0.09" } }]) assert.equal(hasMeasuredVisualGain(baseline, value), false);
});

test("render-identical font replacements are rejected and leave no candidate artifacts", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "font-no-gain-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = { pages: [{ textBoxes: [{ id: "title", text: "content", font: { family: "Microsoft YaHei", sizePt: 20 } }] }] };
  const quality = { checks: [{ name: "quality-rendered", passed: true }], metrics:
    { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.05, "mean-absolute-delta": 14 } };
  const result = await tryBuildFinalEditableTextFontFamilyCandidate({ root, metadata: { generatedDeck: deck }, sourceImages: [], visualQuality: quality,
    isCancellationRequested: async () => false, runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"),
    rawImageQualityVerifier: async () => quality });
  assert.equal(result.accepted, false);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.equal(deck.pages[0].textBoxes[0].font.family, "Microsoft YaHei");
});
