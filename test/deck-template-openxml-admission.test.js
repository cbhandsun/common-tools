"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {runBuilder, invokeBuilder, createMinimalDeckIr, resolveDotnet} = require("./helpers/openxml-contract-fixtures");
const {validateDeckTemplateContext} = require("../packages/slideclone-core/deck-template-context");
const {admitTemplateBuild} = require("../packages/slideclone-core/template-build-admission");
function absoluteDotnet() {
  const command = resolveDotnet();
  if (path.isAbsolute(command)) return command;
  const name = process.platform === "win32" ? "dotnet.exe" : "dotnet";
  const executable = (process.env.PATH || "").split(path.delimiter)
    .filter(directory => path.isAbsolute(directory))
    .map(directory => path.join(directory, name)).find(file => fs.existsSync(file));
  assert.ok(executable, "installed dotnet runtime must be available");
  return executable;
}
test("actual OpenXML template inspection agrees with successful and rejected build requests", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "template-openxml-"));
  try {
    const irFile = path.join(root, "deck.json"), template = path.join(root, "template.pptx");
    const ir = createMinimalDeckIr("Template content");
    fs.writeFileSync(irFile, JSON.stringify(ir));
    runBuilder(["--ir", irFile, "--out", template]);
    const original = fs.readFileSync(template);
    const catalog = JSON.parse(runBuilder(["--inspect-template", template]).stdout);
    assert.deepEqual(catalog.slideIndices, [0]);
    assert.ok(catalog.layoutIds.length > 0);
    const cases = [
      {intent: {templateLayoutId: catalog.layoutIds[0].toUpperCase()}},
      {preserveTemplateSlide: true, intent: {templateLayoutId: "ignored"}},
      {intent: {templateLayoutId: "missing-layout"}},
      {preserveTemplateSlide: true, pageIndex: 1}
    ];
    for (const [index, request] of cases.entries()) {
      const deck = createMinimalDeckIr("Replacement content");
      Object.assign(deck.pages[0], request);
      fs.writeFileSync(irFile, JSON.stringify(deck));
      const output = path.join(root, `result-${index}.pptx`);
      const admission = {
        executable: absoluteDotnet(),
        builderArgs: [path.resolve(__dirname, "../skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/bin/Debug/net8.0/OpenXmlDeckBuilder.dll"), "--template-pptx", template],
        deckFile: irFile, cwd: root, timeoutMs: 60000, isCancellationRequested: () => false
      };
      const result = invokeBuilder(["--ir", irFile, "--out", output, "--template-pptx", template]);
      if (index < 2) {
        await admitTemplateBuild(admission);
        validateDeckTemplateContext(deck.pages, catalog);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(fs.statSync(output).size > 0);
      } else {
        await assert.rejects(admitTemplateBuild(admission), /unavailable/);
        assert.throws(() => validateDeckTemplateContext(deck.pages, catalog), /unavailable/);
        assert.notEqual(result.status, 0);
        assert.equal(fs.existsSync(output), false);
      }
      const noTemplate = invokeBuilder(["--ir", irFile, "--out", path.join(root, `absent-${index}.pptx`)]);
      assert.notEqual(noTemplate.status, 0);
      assert.equal(fs.existsSync(path.join(root, `absent-${index}.pptx`)), false);
    }
    assert.deepEqual(fs.readFileSync(template), original);
    assert.equal(fs.readdirSync(root).some(name => name.includes(".tmp-")), false);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
