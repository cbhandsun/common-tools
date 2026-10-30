'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {verifyRuntimePackage, REQUIRED_FILES, parsePackMetadata} = require('../scripts/verify-runtime-package');
const {runtimePackageFileSpec} = require('../scripts/lib/runtime-package-file-spec');

test('runtime install uses a qualified archive spec and the approved installation deadline', () => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'common-tools-named-archive-')));
  const workspace = path.resolve(__dirname, '..');
  let installArgs, installOptions, archive;
  try {
    assert.throws(() => verifyRuntimePackage({
      repositoryRoot: workspace,
      temporaryDirectory() {
        const directory = path.join(temp, 'with spaces % # 中文');
        fs.mkdirSync(directory);
        return directory;
      },
      commandRunner(command, args, options) {
        assert.equal(command, process.execPath);
        if (args[1] === 'pack') {
          const directory = args[args.indexOf('--pack-destination') + 1];
          archive = path.join(directory, 'common-tools-fixture.tgz');
          fs.writeFileSync(archive, 'fixture');
          return {status: 0, stdout: JSON.stringify([{name: 'common-tools', filename: path.basename(archive), size: 7,
            files: REQUIRED_FILES.map(file => ({path: file, size: 1}))}])};
        }
        assert.equal(args[1], 'install');
        installArgs = [...args];
        installOptions = options;
        // Stop at the real command boundary; a fake successful install would
        // bypass all installed-consumer checks and is not an acceptance test.
        return {status: 1, stdout: '', stderr: 'npm error code EACCES\n'};
      },
    }), /package-install:permission|package-install:npm/u);
    assert.ok(installArgs && installOptions && archive);
    const spec = installArgs.at(-1);
    assert.match(spec, /^common-tools@file:/u);
    assert.equal(spec, `common-tools@file:${archive}`);
    assert.deepEqual(installArgs.slice(1, 6), ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix']);
    assert.equal(installOptions.shell, false);
    assert.equal(installOptions.windowsHide, true);
    assert.equal(installOptions.timeout, 600000);
    assert.equal(installOptions.maxBuffer, 8 * 1024 * 1024);
  } finally {
    // Resolve and bound the exact generated target before recursive removal.
    assert.equal(path.dirname(temp), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('common-tools-named-archive-'));
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('pack metadata must establish the expected name before naming a local archive', () => {
  const metadata = {name: 'common-tools', filename: 'common-tools-fixture.tgz', size: 7,
    files: REQUIRED_FILES.map(file => ({path: file, size: 1}))};
  assert.equal(parsePackMetadata(JSON.stringify([metadata])).name, 'common-tools');
  for (const name of [undefined, '', null, false, '@other/common-tools', 'other-tools', 'common-tools@latest']) {
    assert.throws(() => parsePackMetadata(JSON.stringify([{...metadata, name}])), /package identity/u);
  }
});

test('local archive specs preserve ordinary and reserved-character paths exactly', () => {
  for (const name of ['common-tools.tgz', 'spaces % # 中文.tgz', 'shell $() ` & ;.tgz', 'UPPER.TGZ']) {
    const archive = path.join(os.tmpdir(), name);
    const spec = runtimePackageFileSpec('common-tools', archive);
    assert.equal(spec, `common-tools@file:${archive}`);
  }
});

test('local archive specs reject absent, foreign, relative, hostile and extreme input safely', () => {
  for (const name of [null, undefined, '', {}, 'other-tools', 'common-tools@latest', '@other/common-tools']) {
    assert.throws(() => runtimePackageFileSpec(name, path.join(os.tmpdir(), 'common-tools.tgz')), /identity/u);
  }
  let getters = 0;
  const hostile = {get toString() { getters++; throw new Error('private-input'); }};
  const proxy = new Proxy({}, {get() { getters++; throw new Error('private-input'); }});
  for (const archive of [undefined, null, '', 123, hostile, proxy, 'relative.tgz', 'https://example.invalid/a.tgz',
    path.join(os.tmpdir(), 'not-an-archive.zip'), path.join(os.tmpdir(), 'bad\nname.tgz'),
    path.join(os.tmpdir(), 'bad\0name.tgz'), path.join(os.tmpdir(), 'x'.repeat(32768) + '.tgz')]) {
    assert.throws(() => runtimePackageFileSpec('common-tools', archive), error => {
      assert.equal(error instanceof TypeError, true);
      assert.equal(error.message, 'Runtime package install archive is invalid');
      return true;
    });
  }
  assert.equal(getters, 0);
  for (const code of [...Array.from({length: 32}, (_, index) => index), 127]) {
    assert.throws(() => runtimePackageFileSpec('common-tools', path.join(os.tmpdir(), `bad${String.fromCharCode(code)}name.tgz`)), /archive is invalid/u);
  }
});
