"use strict";

const {
  cancelJob,
  createEditableJob,
  editableVisualSummary,
  getJob,
  REGISTRATION: EDITABLE_REGISTRATION
} = require("../slideclone-core");
const {
  CAPABILITY: PROJECT_AUDIT_CAPABILITY,
  REGISTRATION: PROJECT_AUDIT_REGISTRATION,
  createProjectAuditJob,
  projectAuditSummary
} = require("../project-audit-core");
const {
  CAPABILITY: PPT_QUALITY_CAPABILITY,
  REGISTRATION: PPT_QUALITY_REGISTRATION,
  createPptQualityJob,
  pptQualitySummary
} = require("../ppt-quality-core");
const { QUALITY_REPORT_UI_CONTRIBUTION } = require("../ppt-quality-core/ui-contribution");
const {
  CAPABILITY: PPT_IMPROVE_CAPABILITY,
  REGISTRATION: PPT_IMPROVE_REGISTRATION,
  createPptImproveJob,
  pptImproveSummary
} = require("../ppt-improve-core");
const {
  CAPABILITY: PPT_CREATE_CAPABILITY,
  REGISTRATION: PPT_CREATE_REGISTRATION,
  createPptCreateJob,
  pptCreateSummary
} = require("../ppt-create-core");

const IMAGE_TO_EDITABLE_CAPABILITY = EDITABLE_REGISTRATION.capability;

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

const CAPABILITY_MODULES = Object.freeze([
  defineCapabilityModule({
    registration: EDITABLE_REGISTRATION,
    createHandlers: {
      create_editable_job: (args, context) => createEditableJob({ ...context, input: args.input, inputs: args.inputs, output: args.output, config: args.config, idempotencyKey: args.idempotencyKey })
    }
  }),
  defineCapabilityModule({
    registration: PROJECT_AUDIT_REGISTRATION,
    createHandlers: {
      create_project_audit_job: (args, context) => createProjectAuditJob({ ...context, projectRoot: args.projectRoot || context.workspaceRoot, output: args.output, level: args.level, scope: args.scope, idempotencyKey: args.idempotencyKey })
    },
    reportHandlers: {
      get_project_audit_report: { label: "project audit", key: "audit", summary: projectAuditSummary }
    }
  }),
  defineCapabilityModule({
    registration: PPT_QUALITY_REGISTRATION,
    createHandlers: {
      create_ppt_quality_job: (args, context) => createPptQualityJob({ ...context, input: args.input, output: args.output, idempotencyKey: args.idempotencyKey })
    },
    reportHandlers: {
      get_ppt_quality_report: { label: "PPT quality audit", key: "audit", summary: pptQualitySummary }
    },
    uiContributions: [QUALITY_REPORT_UI_CONTRIBUTION]
  }),
  defineCapabilityModule({
    registration: PPT_IMPROVE_REGISTRATION,
    createHandlers: {
      create_ppt_improve_job: (args, context) => createPptImproveJob({ ...context, input: args.input, report: args.report, output: args.output, idempotencyKey: args.idempotencyKey, profile: args.profile })
    },
    reportHandlers: {
      get_ppt_improve_report: { label: "PPT improvement", key: "improvement", summary: pptImproveSummary }
    }
  }),
  defineCapabilityModule({
    registration: PPT_CREATE_REGISTRATION,
    createHandlers: {
      create_ppt_create_job: (args, context) => createPptCreateJob({ ...context, input: args.input, output: args.output, idempotencyKey: args.idempotencyKey })
    },
    reportHandlers: {
      get_ppt_create_report: { label: "PPT creation", key: "creation", summary: pptCreateSummary }
    }
  })
]);

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
  createLocalJob,
  defineCapabilityModule,
  readLocalJob
};
