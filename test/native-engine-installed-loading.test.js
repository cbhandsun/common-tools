'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const repository = path.resolve(__dirname, '..');
function copyRuntimeSources(target) {
  for (const name of ['slideclone-native-engine', 'slideclone-core', 'ooxml-core']) {
    fs.cpSync(path.join(repository, 'packages', name), path.join(target, 'packages', name), {
      recursive: true,
      filter(file) {
        const relative = path.relative(path.join(repository, 'packages', name), file);
        if (relative.split(path.sep).some(part => ['node_modules', 'bin', 'obj'].includes(part))) return false;
        return fs.statSync(file).isDirectory() || /\.(?:js|json)$/u.test(file);
      }
    });
  }
}
function coldLoad(root) {
  const code = `
    const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
    const root=fs.realpathSync(process.argv[1]),resolve=Module._resolveFilename;
    Module._resolveFilename=function(...args){const result=resolve.apply(this,args);if(path.isAbsolute(result)){const relative=path.relative(root,result);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));}return result;};
    try{
      const engine=require(path.join(root,'packages/slideclone-native-engine'));
      assert.equal(typeof engine.loadNativeImageRebuilder().rebuildDeckFromWorkDir,'function');
      const bridge=require(path.join(root,'packages/slideclone-native-engine/scripts/lib/asset-closure-funnel'));
      assert.equal(bridge,require(path.join(root,'packages/slideclone-core/archetypes/asset-closure-funnel')));
      assert.equal(fs.existsSync(path.join(root,'decoy-loaded')),false);
      process.stdout.write('ready');
    }catch(error){process.stdout.write(error?.code==='MODULE_NOT_FOUND'?'missing-module':'native-load-failed');process.exitCode=2;}
  `;
  return spawnSync(process.execPath, ['-e', code, root], {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: {...process.env, NODE_PATH: '', NODE_OPTIONS: ''}});
}

test('the real native engine loads from embedded siblings without workspace links or ambient aliases', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'common-tools-native-no-links-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  copyRuntimeSources(root);
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
  const clean = coldLoad(root);
  assert.equal(clean.status, 0, clean.stdout);
  assert.equal(clean.stdout, 'ready');
  const alias = path.join(root, 'node_modules/@common-tools/slideclone-core');
  fs.mkdirSync(alias, {recursive: true});
  fs.writeFileSync(path.join(alias, 'package.json'), JSON.stringify({name:'@common-tools/slideclone-core',exports:{'./*':'./decoy.js'}}));
  fs.writeFileSync(path.join(alias, 'decoy.js'), "require('node:fs').writeFileSync(require('node:path').join(__dirname,'../../../decoy-loaded'),'unexpected');throw Error('ambient alias loaded');");
  const conflicted = coldLoad(root);
  assert.equal(conflicted.status, 0, conflicted.stdout);
  assert.equal(conflicted.stdout, 'ready');
  assert.equal(fs.existsSync(path.join(root, 'decoy-loaded')), false);
  fs.unlinkSync(path.join(root, 'packages/slideclone-core/package.json'));
  const missing = coldLoad(root);
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, 'missing-module');
  assert.equal(fs.existsSync(path.join(root, 'decoy-loaded')), false);
});
