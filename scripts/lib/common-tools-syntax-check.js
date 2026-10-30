// @ts-check
'use strict';
const path = require('node:path');
const {types} = require('node:util');
const {run} = require('../../packages/slideclone-core/renderer-process');

/** Syntax errors can echo entire source lines. Preserve a fixed process
 * classification and file identity without copying source into logs.
 * @param {unknown} error @param {string} file */
function syntaxFailure(error, file) {
  const category = types.isNativeError(error) && [
    'renderer process timed out', 'renderer process could not start',
    'renderer process termination was not confirmed', 'renderer stderr exceeds limits',
  ].includes(error.message) ? error.message : 'syntax check subprocess failed';
  return Object.assign(new Error(`JavaScript syntax check failed: ${file} (${category})`, {cause: new Error(category)}),
    {code: 'SYNTAX_CHECK_FAILED', category});
}

/** @param {typeof run} [runner] */
function createSyntaxChecker(runner = run) {
  if (typeof runner !== 'function') throw new TypeError('Syntax check runner is invalid');
  /** @param {unknown} file */
  return async file => {
    if (typeof file !== 'string' || !file || file.length > 32768 || /[\0\r\n]/u.test(file)) {
      throw new TypeError('Syntax check file is invalid');
    }
    const resolved = path.resolve(file);
    try {
      await runner(process.execPath, ['--check', resolved], {timeout: 60000, maxBuffer: 65536});
    } catch (error) {
      throw syntaxFailure(error, resolved);
    }
  };
}

module.exports = {createSyntaxChecker, syntaxCheck: createSyntaxChecker()};
