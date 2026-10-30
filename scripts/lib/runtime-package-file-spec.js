// @ts-check
'use strict';
const path = require('node:path');

/** Keep the install identity tied to the already validated archive. npm's
 * local-file manifest reader still unpacks the archive, even with this name.
 * npm expects a literal local file path after `file:`;
 * URL percent encoding would make its argument parser target a different file.
 * Archive identity/size and installed-consumer verification stay with callers.
 * @param {unknown} name @param {unknown} archive */
function runtimePackageFileSpec(name, archive) {
  if (name !== 'common-tools') throw new TypeError('Runtime package install identity is invalid');
  if (typeof archive !== 'string' || archive.length > 32767 || !path.isAbsolute(archive)
    || [...archive].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || !/\.tgz$/iu.test(archive)) {
    throw new TypeError('Runtime package install archive is invalid');
  }
  return `${name}@file:${archive}`;
}

module.exports = {runtimePackageFileSpec};
