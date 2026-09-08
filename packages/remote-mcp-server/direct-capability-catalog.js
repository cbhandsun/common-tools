"use strict";

const { REMOTE_CAPABILITY_MODULE: SIYUAN_REMOTE_CAPABILITY_MODULE } = require("../siyuan-note-core");

const DIRECT_CAPABILITY_CATALOG = Object.freeze([
  SIYUAN_REMOTE_CAPABILITY_MODULE
]);

function directCapabilityModules() {
  return Object.freeze([...DIRECT_CAPABILITY_CATALOG]);
}

function directToolContracts() {
  return Object.freeze(DIRECT_CAPABILITY_CATALOG.flatMap((module) => module.directToolContracts || []));
}

function directToolArguments() {
  return Object.freeze(Object.assign({}, ...DIRECT_CAPABILITY_CATALOG.map((module) => module.directToolArguments || {})));
}

function directToolMethods() {
  return Object.freeze(Object.assign({}, ...DIRECT_CAPABILITY_CATALOG.map((module) => module.directToolMethods || {})));
}

module.exports = {
  DIRECT_CAPABILITY_CATALOG,
  directCapabilityModules,
  directToolArguments,
  directToolContracts,
  directToolMethods
};
