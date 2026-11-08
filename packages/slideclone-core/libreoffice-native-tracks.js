// @ts-check
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {types} = require('node:util');
const {run} = require('./renderer-process');

/** @param {string} office @param {NodeJS.ProcessEnv} [environment] @param {string} [platform] */
function resolveUnoPython(office, environment = process.env, platform = process.platform) {
  const configured = environment.LIBREOFFICE_PYTHON_BIN;
  if (configured !== undefined) {
    if (!configured || configured.length > 32768 || /[\0\r\n]/u.test(configured)) throw new TypeError('LibreOffice Python executable is invalid');
    return configured;
  }
  const sibling = path.join(path.dirname(office), platform === 'win32' ? 'python.exe' : 'python');
  if (path.isAbsolute(office) && fs.existsSync(sibling)) return sibling;
  if (platform === 'win32') throw new Error('LibreOffice native tracks require LIBREOFFICE_PYTHON_BIN with UNO support');
  return '/usr/bin/python3';
}

/** @param {unknown} value */
function parseTrackResult(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 4096) throw new TypeError('LibreOffice native track result is invalid');
  /** @type {unknown} */ let parsed;
  try { parsed = JSON.parse(value); } catch { throw new TypeError('LibreOffice native track result is invalid'); }
  if (!parsed || typeof parsed !== 'object') throw new TypeError('LibreOffice native track result is invalid');
  const row = /** @type {Record<string, unknown>} */ (parsed);
  if (row.version !== 1 || !Number.isSafeInteger(row.restoredTracks) || typeof row.restoredTracks !== 'number'
    || row.restoredTracks < 1 || row.restoredTracks > 10000 || !Number.isSafeInteger(row.skippedNativeConnectors)
    || typeof row.skippedNativeConnectors !== 'number' || row.skippedNativeConnectors < 0 || row.skippedNativeConnectors > 10000
    || row.nativeShapeTypesRetained !== true || row.importedTracksVerified !== true || row.renderedPathsVerified !== false
    || row.officeEditingVerified !== false || !['clean-exit', 'bridge-disposed-clean-exit'].includes(String(row.shutdown))) {
    throw new TypeError('LibreOffice native track result is invalid');
  }
  return {restoredTracks: row.restoredTracks, skippedNativeConnectors: row.skippedNativeConnectors,
    nativeShapeTypesRetained: true, importedTracksVerified: true, renderedPathsVerified: false,
    officeEditingVerified: false, shutdown: String(row.shutdown)};
}

/** Process output and exception text can contain document content. Retain a
 * fixed failure category at this serialization boundary, including errors
 * crossing a VM realm, without copying stdout/stderr into public causes.
 * @param {unknown} error */
function nativeTrackFailure(error) {
  const message = types.isNativeError(error) ? error.message : '';
  const controlled = ['editable job was cancelled', 'renderer process timed out', 'renderer process termination was not confirmed'];
  const category = controlled.includes(message) ? message : 'LibreOffice native track conversion failed; verify the UNO Python dependency and input geometry';
  return new Error(category, {cause: new Error(controlled.includes(message) ? message : 'native track subprocess failed')});
}

/** @param {{cleanupDir:string,pptxFile:string}} conversion @param {string} office
 * @param {{timeout:number,isCancellationRequested?:()=>boolean|Promise<boolean>}} options */
async function renderNativeTracks(conversion, office, options) {
  if (!Number.isSafeInteger(options.timeout) || options.timeout <= 0 || options.timeout > 2147483647) {
    throw new TypeError('LibreOffice native track conversion requires a finite process deadline');
  }
  const python = resolveUnoPython(office);
  const script = path.join(__dirname, 'python/libreoffice_native_render.py');
  let result;
  try {
    result = await run(python, ['-I', '-B', script, conversion.cleanupDir, path.basename(conversion.pptxFile), office],
      {...options, maxBuffer: 4096});
  } catch (error) {
    throw nativeTrackFailure(error);
  }
  return parseTrackResult(result.stdout);
}

module.exports = {resolveUnoPython, parseTrackResult, renderNativeTracks};
