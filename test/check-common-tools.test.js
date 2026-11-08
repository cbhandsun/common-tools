"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkCommonTools, collectCommonToolFiles, runLimited, syntaxCheckConcurrency } = require("../scripts/check-common-tools");

test("common-tools syntax checker uses bounded parallelism without dropping work", async () => {
  const seen = [];
  let active = 0;
  let maxActive = 0;
  await runLimited([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    seen.push(value);
    active -= 1;
  });
  assert.deepEqual(seen.sort(), [1, 2, 3, 4]);
  assert.equal(maxActive <= 2, true);
  assert.equal(syntaxCheckConcurrency() >= 1, true);
  assert.equal(syntaxCheckConcurrency() <= 8, true);
});

test("common-tools syntax checker propagates worker failures", async () => {
  await assert.rejects(
    runLimited(["safe", "broken"], 2, async (value) => {
      if (value === "broken") throw new Error("boom");
    }),
    /boom/
  );
});

test("common-tools syntax checker collects repository files lazily and accepts bounded file lists", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "check-common-tools-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "valid.js");
  fs.writeFileSync(file, '"use strict";\nmodule.exports = true;\n');
  assert.equal(await checkCommonTools({ files: [file] }), 1);
  assert.equal(collectCommonToolFiles().some((candidate) => candidate.endsWith(path.join("packages", "cli", "bin", "common-tools.js"))), true);
  const nativeEnginePayload = path.join("packages", "slideclone-native-engine", "scripts", "component-candidate-search.js");
  assert.equal(collectCommonToolFiles().some((candidate) => candidate.endsWith(nativeEnginePayload)), true);
  assert.equal(await checkCommonTools({ files: [path.join(path.resolve(__dirname, ".."), nativeEnginePayload)] }), 1);
  await assert.rejects(checkCommonTools({ files: [path.join(directory, "missing.js")] }));
  await assert.rejects(checkCommonTools({ files: [null] }), /files are invalid/);
});

test('syntax checks use bounded process termination and output, and timeouts remain failures',async()=>{
  const {createSyntaxChecker}=require('../scripts/lib/common-tools-syntax-check');
  let call;
  const success=createSyntaxChecker(async(...args)=>{call=args;return {stdout:'',stderr:''};});
  await success('safe.js');assert.equal(call[0],process.execPath);assert.deepEqual(call[1],['--check',path.resolve('safe.js')]);
  assert.deepEqual(call[2],{timeout:60000,maxBuffer:65536});
  for(const message of ['renderer process timed out','renderer process termination was not confirmed','renderer process could not start']){
    const check=createSyntaxChecker(async()=>{throw Object.assign(new Error(message),{stdout:'private source',stderr:'private source'});});
    await assert.rejects(check('safe.js'),error=>{
      assert.equal(error.code,'SYNTAX_CHECK_FAILED');assert.equal(error.category,message);
      assert.ok(error.message.includes(message));assert.ok(!error.message.includes('private source'));
      assert.equal(error.cause.message,message);assert.equal(error.stderr,undefined);return true;
    });
  }
  const invalid=createSyntaxChecker(async()=>assert.fail('invalid input must not spawn a child'));
  for(const value of [null,undefined,1,'','\0','a\nb','x'.repeat(32769)])await assert.rejects(invalid(value),TypeError);
});

test('actual invalid JavaScript fails without logging the source line',async t=>{
  const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
  const root=createTemporaryTestDirectory('syntax-private-source-');t.after(()=>removeTemporaryTestDirectory(root));
  const file=path.join(root,'invalid.js');fs.writeFileSync(file,"const PRIVATE_SOURCE_SENTINEL = ;\n");
  const {syntaxCheck}=require('../scripts/lib/common-tools-syntax-check');
  await assert.rejects(syntaxCheck(file),error=>{
    assert.equal(error.code,'SYNTAX_CHECK_FAILED');assert.ok(!String(error).includes('PRIVATE_SOURCE_SENTINEL'));
    assert.ok(!String(error.cause).includes('PRIVATE_SOURCE_SENTINEL'));return true;
  });
});

test('a real stalled syntax child is terminated and reported as failure',{timeout:15000},async()=>{
  const {createSyntaxChecker}=require('../scripts/lib/common-tools-syntax-check');
  const {run}=require('../packages/slideclone-core/renderer-process');
  const check=createSyntaxChecker((_command,_args,options)=>run(process.execPath,['-e','setInterval(()=>{},1000)'],{...options,timeout:250}));
  await assert.rejects(check('controlled.js'),error=>error.code==='SYNTAX_CHECK_FAILED'&&error.category==='renderer process timed out');
});

test('syntax boundary source and subprocess regressions are included in unified gates',()=>{
  const {includesSuite,classifyTestResource}=require('../scripts/test-suites');
  assert.equal(includesSuite('check-common-tools.test.js','integration'),true);
  assert.equal(classifyTestResource('check-common-tools.test.js'),'external-process');
  assert.ok(require('../scripts/lint-common-tools').eslintTargets.includes('scripts/lib/common-tools-syntax-check.js'));
  const config=JSON.parse(fs.readFileSync(path.resolve('tsconfig.boundaries.json'),'utf8'));
  assert.ok(config.include.includes('scripts/lib/common-tools-syntax-check.js'));
});
