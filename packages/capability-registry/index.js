"use strict";

const {
  cancelJob,
  editableVisualSummary,
  getJob,
  CAPABILITY_MODULE: EDITABLE_CAPABILITY_MODULE
} = require("../slideclone-core");
const {
  CAPABILITY: PROJECT_AUDIT_CAPABILITY,
  CAPABILITY_MODULE: PROJECT_AUDIT_CAPABILITY_MODULE
} = require("../project-audit-core");
const {
  CAPABILITY: PPT_QUALITY_CAPABILITY,
  CAPABILITY_MODULE: PPT_QUALITY_CAPABILITY_MODULE
} = require("../ppt-quality-core");
const {
  CAPABILITY: PPT_IMPROVE_CAPABILITY,
  CAPABILITY_MODULE: PPT_IMPROVE_CAPABILITY_MODULE
} = require("../ppt-improve-core");
const {
  CAPABILITY: PPT_CREATE_CAPABILITY,
  CAPABILITY_MODULE: PPT_CREATE_CAPABILITY_MODULE
} = require("../ppt-create-core");
const { CAPABILITY_MANIFESTS } = require("../capability-manifests");

const IMAGE_TO_EDITABLE_CAPABILITY = EDITABLE_CAPABILITY_MODULE.registration.capability;

function defineCapabilityModule(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new TypeError("capability module definition is invalid");
  if (!definition.registration || typeof definition.registration.capability !== "string" || !Array.isArray(definition.registration.toolNames)) throw new TypeError("capability module registration is invalid");
  const createHandlers = definition.createHandlers || {};
  const reportHandlers = definition.reportHandlers || {};
  const uiContributions = definition.uiContributions || [];
  if (typeof createHandlers !== "object" || Array.isArray(createHandlers) || typeof reportHandlers !== "object" || Array.isArray(reportHandlers) || !Array.isArray(uiContributions)) throw new TypeError("capability module handlers are invalid");
  return Object.freeze({
    registration: definition.registration,
    createHandlers: Object.freeze({ ...createHandlers }),
    reportHandlers: Object.freeze({ ...reportHandlers }),
    uiContributions: Object.freeze([...uiContributions])
  });
}

function assertCapabilityModulesMatchManifests(modules, manifests = CAPABILITY_MANIFESTS) {
  if (!Array.isArray(modules) || !(manifests instanceof Map)) throw new TypeError("capability registry metadata is invalid");
  const seen = new Set();
  for (const module of modules) {
    const registration = module?.registration;
    if (!registration || typeof registration.capability !== "string") throw new TypeError("capability module registration is invalid");
    if (seen.has(registration.capability)) throw new Error("duplicate capability module registration");
    seen.add(registration.capability);
    const manifest = manifests.get(registration.capability);
    if (!manifest) throw new Error(`capability module manifest is missing: ${registration.capability}`);
    const expectedTools = [...manifest.toolNames].sort();
    const registeredTools = [...registration.toolNames].sort();
    if (JSON.stringify(registeredTools) !== JSON.stringify(expectedTools)
      || registration.minimumRuntimeVersion !== manifest.minimumRuntimeVersion
      || registration.requiredWorkerProfile !== manifest.requiredWorkerProfile) {
      throw new Error(`capability module manifest mismatch: ${registration.capability}`);
    }
  }
  const expectedLocalCapabilities = [...manifests.values()].filter((manifest) => manifest.requiredWorkerProfile !== "direct").map((manifest) => manifest.capability).sort();
  const registeredLocalCapabilities = [...seen].sort();
  if (JSON.stringify(registeredLocalCapabilities) !== JSON.stringify(expectedLocalCapabilities)) throw new Error("capability registry is missing a local capability module");
  return true;
}

const CAPABILITY_MODULES = Object.freeze([
  EDITABLE_CAPABILITY_MODULE,
  PROJECT_AUDIT_CAPABILITY_MODULE,
  PPT_QUALITY_CAPABILITY_MODULE,
  PPT_IMPROVE_CAPABILITY_MODULE,
  PPT_CREATE_CAPABILITY_MODULE
].map(defineCapabilityModule));
assertCapabilityModulesMatchManifests(CAPABILITY_MODULES);

const LOCAL_REGISTRATIONS = Object.freeze(CAPABILITY_MODULES.map((module) => module.registration));
const UI_CONTRIBUTIONS = Object.freeze(CAPABILITY_MODULES.flatMap((module) => module.uiContributions));
const CREATE_TOOL_HANDLERS = Object.freeze(Object.fromEntries(CAPABILITY_MODULES.flatMap((module) => Object.entries(module.createHandlers).map(([name, create]) => [name, Object.freeze({ capability: module.registration.capability, create })]))));
const REPORT_TOOL_HANDLERS = Object.freeze(Object.fromEntries(CAPABILITY_MODULES.flatMap((module) => Object.entries(module.reportHandlers).map(([name, handler]) => [name, Object.freeze({ capability: module.registration.capability, ...handler })]))));

function createLocalJob(name, args, context) {
  const handler = CREATE_TOOL_HANDLERS[name];
  return handler ? handler.create(args, context) : undefined;
}

function readLocalJob(name, args, context) {
  const currentJob = getJob({ ...context, id: args.id });
  if (!currentJob) throw new Error("job not found");
  if (currentJob.ownerId !== context.ownerId) throw new Error("job is not owned by this principal");
  if (["get_job", "cancel_job", "list_job_artifacts"].includes(name) && currentJob.capability !== IMAGE_TO_EDITABLE_CAPABILITY) throw new Error("job belongs to a different capability");
  const job = name === "cancel_job" ? cancelJob({ ...context, id: args.id }) : currentJob;
  if (name === "list_job_artifacts") return { id: job.id, artifacts: job.artifacts };
  if (name === "get_job") return { ...job, visual: editableVisualSummary(job, context.workspaceRoot) };
  const handler = REPORT_TOOL_HANDLERS[name];
  if (!handler) return job;
  if (job.capability !== handler.capability) throw new Error(`job is not a ${handler.label}`);
  return { id: job.id, capability: job.capability, status: job.status, artifacts: job.artifacts, quality: job.quality || null, [handler.key]: handler.summary(job, context.workspaceRoot) };
}

module.exports = {
  CAPABILITY_MODULES,
  IMAGE_TO_EDITABLE_CAPABILITY,
  LOCAL_REGISTRATIONS,
  PPT_CREATE_CAPABILITY,
  PPT_IMPROVE_CAPABILITY,
  PPT_QUALITY_CAPABILITY,
  PROJECT_AUDIT_CAPABILITY,
  UI_CONTRIBUTIONS,
  assertCapabilityModulesMatchManifests,
  createLocalJob,
  defineCapabilityModule,
  readLocalJob
};
