// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const timers = require("node:timers/promises");
const { types } = require("node:util");

/** @typedef {{dev:bigint,ino:bigint,birthtimeNs:bigint}} DirectoryIdentity */

// Six rename attempts, at most 775ms of waiting. Outer CI budgets do not change.
const RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200, 400]);
const LOCK_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

function boundaryError() {
  return new Error("Office local cache publication boundary is invalid");
}

/** @param {unknown} error @param {string} key @returns {unknown} */
function errorField(error, key) {
  if (error === null || typeof error !== "object" || types.isProxy(error)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/** @param {string} target */
function statOrMissing(target) {
  try { return fs.lstatSync(target); } catch (error) { if (errorField(error, "code") === "ENOENT") return null; throw error; }
}

/** @param {string} target */
function plainAncestors(target) {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw boundaryError();
  }
}

/** @param {string} target @returns {DirectoryIdentity} */
function directoryIdentity(target) {
  const stat = fs.lstatSync(target, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) throw boundaryError();
  return Object.freeze({ dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs });
}

/** @param {string} target @param {DirectoryIdentity} expected */
function assertIdentity(target, expected) {
  const actual = directoryIdentity(target);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino || actual.birthtimeNs !== expected.birthtimeNs) throw boundaryError();
}

/** @param {unknown} error @param {string} source @param {string} destination */
function retryableRename(error, source, destination) {
  if (error === null || typeof error !== "object" || types.isProxy(error) || !types.isNativeError(error)) return false;
  const code = errorField(error, "code");
  return typeof code === "string" && LOCK_CODES.has(code) && errorField(error, "syscall") === "rename"
    && errorField(error, "path") === source && errorField(error, "dest") === destination;
}

// The caller supplies its existing bounded, no-link inventory validator.
// No lock is introduced: checks detect visible replacement, but lstat-to-rm
// and lstat-to-rename still have a cross-process TOCTOU window.
/** @param {unknown} managedValue @param {unknown} entryValue @param {unknown} inspectValue */
function createLocalCachePublication(managedValue, entryValue, inspectValue) {
  if (typeof managedValue !== "string" || typeof entryValue !== "string" || typeof inspectValue !== "function" || types.isProxy(inspectValue)) throw boundaryError();
  const managed = managedValue, entry = entryValue;
  if ([managed, entry].some((value) => !path.isAbsolute(value) || value.length > 4096
      || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    || path.resolve(managed) !== managed || path.resolve(entry) !== entry
    || managed === path.parse(managed).root || path.dirname(entry) !== managed || !/^[a-f0-9]{64}$/u.test(path.basename(entry))) throw boundaryError();
  const inspect = /** @type {(target:string)=>unknown} */ (inspectValue);
  plainAncestors(managed);
  const managedIdentity = directoryIdentity(managed);
  const previous = statOrMissing(entry) ? directoryIdentity(entry) : null;
  if (previous) inspect(entry);
  const staging = fs.mkdtempSync(path.join(managed, "staging-"));
  const stagingIdentity = directoryIdentity(staging);
  let started = false;

  function checkManaged() {
    plainAncestors(managed);
    assertIdentity(managed, managedIdentity);
  }

  function checkStaging() {
    checkManaged();
    assertIdentity(staging, stagingIdentity);
    inspect(staging);
  }

  function requireEmptyTarget() {
    if (statOrMissing(entry)) throw new Error("Office local cache publication target changed");
  }

  async function publish() {
    if (started) throw new Error("Office local cache publication was already attempted");
    started = true;
    // Remove only the old identity captured BEFORE copying, once. A different
    // writer's new entry is never removed to make a retry succeed.
    if (previous) {
      checkStaging();
      assertIdentity(entry, previous);
      inspect(entry);
      fs.rmSync(entry, { recursive: true });
    }
    for (let attempt = 0; ; attempt += 1) {
      checkStaging();
      requireEmptyTarget();
      try {
        fs.renameSync(staging, entry);
        return;
      } catch (error) {
        if (!retryableRename(error, staging, entry) || attempt === RETRY_DELAYS_MS.length) throw error;
        await timers.setTimeout(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  function cleanup() {
    checkManaged();
    if (!statOrMissing(staging)) return;
    assertIdentity(staging, stagingIdentity);
    inspect(staging);
    fs.rmSync(staging, { recursive: true });
  }

  return Object.freeze({ staging, publish, cleanup });
}

module.exports = { createLocalCachePublication };
