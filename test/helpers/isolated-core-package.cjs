'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin } = require('node:module');
const { collectImports } = require('../../scripts/verify-workspace-boundaries');
const core = path.resolve(__dirname, '../../packages/slideclone-core');
const manifest = require('../../packages/slideclone-core/package.json');

function coreModulePath(name) {
  if (name === 'package.json') return name;
  const key = './' + name.replace(/\.js$/u, '');
  const exported = manifest.exports[key];
  if (typeof exported === 'string' && exported.startsWith('./')) return exported.slice(2);
  // Some internal fixture modules intentionally have no public package export.
  const filename = name.endsWith('.js') ? name : name + '.js';
  const matches = ['', 'ocr/', 'typography/', 'scene-plan/', 'routing/', 'archetypes/', 'quality/']
    .map(prefix => prefix + filename).filter(relative => fs.existsSync(path.join(core, relative)));
  if (matches.length !== 1) throw new Error('Missing or ambiguous core module: ' + key);
  return matches[0];
}

// Copy the real relative dependency closure, preserving the package layout.
// A test cannot accidentally resolve missing files from the workspace package.
function copyCoreModuleClosure(installed, names, releaseFiles) {
  fs.mkdirSync(installed, { recursive: true });
  fs.copyFileSync(path.join(core, 'package.json'), path.join(installed, 'package.json'));
  const pending = names.map(name => path.join(core, coreModulePath(name)));
  const copied = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (copied.has(file)) continue;
    copied.add(file);
    const relative = path.relative(core, file).replaceAll('\\', '/');
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Dependency escaped core');
    if (releaseFiles && !releaseFiles.includes('packages/slideclone-core/' + relative)) throw new Error(relative + ' must be shipped');
    const target = path.join(installed, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    if (!file.endsWith('.js')) continue;
    for (const dependency of collectImports(fs.readFileSync(file, 'utf8'), relative)) {
      if (isBuiltin(dependency.specifier)) continue;
      if (!dependency.specifier.startsWith('.')) throw new Error('External core fixture dependency: ' + dependency.specifier);
      pending.push(require.resolve(path.resolve(path.dirname(file), dependency.specifier)));
    }
  }
  return [...copied].map(file => path.relative(core, file).replaceAll('\\', '/'));
}
module.exports = { coreModulePath, copyCoreModuleClosure };
