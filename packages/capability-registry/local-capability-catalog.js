"use strict";

const { CAPABILITY_MODULE: EDITABLE_CAPABILITY_MODULE } = require("../slideclone-core");
const { CAPABILITY_MODULE: PROJECT_AUDIT_CAPABILITY_MODULE } = require("../project-audit-core");
const { CAPABILITY_MODULE: PPT_QUALITY_CAPABILITY_MODULE } = require("../ppt-quality-core");
const { CAPABILITY_MODULE: PPT_IMPROVE_CAPABILITY_MODULE } = require("../ppt-improve-core");
const { CAPABILITY_MODULE: PPT_CREATE_CAPABILITY_MODULE } = require("../ppt-create-core");

const LOCAL_CAPABILITY_CATALOG = Object.freeze([
  Object.freeze({ packageName: "@common-tools/slideclone-core", module: EDITABLE_CAPABILITY_MODULE }),
  Object.freeze({ packageName: "@common-tools/project-audit-core", module: PROJECT_AUDIT_CAPABILITY_MODULE }),
  Object.freeze({ packageName: "@common-tools/ppt-quality-core", module: PPT_QUALITY_CAPABILITY_MODULE }),
  Object.freeze({ packageName: "@common-tools/ppt-improve-core", module: PPT_IMPROVE_CAPABILITY_MODULE }),
  Object.freeze({ packageName: "@common-tools/ppt-create-core", module: PPT_CREATE_CAPABILITY_MODULE })
]);

function loadLocalCapabilityModules() {
  return Object.freeze(LOCAL_CAPABILITY_CATALOG.map((entry) => entry.module));
}

module.exports = {
  LOCAL_CAPABILITY_CATALOG,
  loadLocalCapabilityModules
};
