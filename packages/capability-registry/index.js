"use strict";

const { cancelJob, createEditableJob, editableVisualSummary, getJob, REGISTRATION: EDITABLE_REGISTRATION } = require("../slideclone-core");
const { CAPABILITY: PROJECT_AUDIT_CAPABILITY, REGISTRATION: PROJECT_AUDIT_REGISTRATION, createProjectAuditJob, projectAuditSummary } = require("../project-audit-core");
const { CAPABILITY: PPT_QUALITY_CAPABILITY, REGISTRATION: PPT_QUALITY_REGISTRATION, createPptQualityJob, pptQualitySummary } = require("../ppt-quality-core");
const { CAPABILITY: PPT_IMPROVE_CAPABILITY, REGISTRATION: PPT_IMPROVE_REGISTRATION, createPptImproveJob, pptImproveSummary } = require("../ppt-improve-core");
const { CAPABILITY: PPT_CREATE_CAPABILITY, REGISTRATION: PPT_CREATE_REGISTRATION, createPptCreateJob, pptCreateSummary } = require("../ppt-create-core");

const IMAGE_TO_EDITABLE_CAPABILITY = EDITABLE_REGISTRATION.capability;
const LOCAL_REGISTRATIONS = Object.freeze([EDITABLE_REGISTRATION, PROJECT_AUDIT_REGISTRATION, PPT_QUALITY_REGISTRATION, PPT_IMPROVE_REGISTRATION, PPT_CREATE_REGISTRATION]);

const CREATE_TOOL_HANDLERS = Object.freeze({
  create_editable_job: Object.freeze({
    capability: IMAGE_TO_EDITABLE_CAPABILITY,
    create: (args, context) => createEditableJob({ ...context, input: args.input, inputs: args.inputs, output: args.output, config: args.config, idempotencyKey: args.idempotencyKey })
  }),
  create_project_audit_job: Object.freeze({
    capability: PROJECT_AUDIT_CAPABILITY,
    create: (args, context) => createProjectAuditJob({ ...context, projectRoot: args.projectRoot || context.workspaceRoot, output: args.output, level: args.level, scope: args.scope, idempotencyKey: args.idempotencyKey })
  }),
  create_ppt_quality_job: Object.freeze({
    capability: PPT_QUALITY_CAPABILITY,
    create: (args, context) => createPptQualityJob({ ...context, input: args.input, output: args.output, idempotencyKey: args.idempotencyKey })
  }),
  create_ppt_improve_job: Object.freeze({
    capability: PPT_IMPROVE_CAPABILITY,
    create: (args, context) => createPptImproveJob({ ...context, input: args.input, report: args.report, output: args.output, idempotencyKey: args.idempotencyKey, profile: args.profile })
  }),
  create_ppt_create_job: Object.freeze({
    capability: PPT_CREATE_CAPABILITY,
    create: (args, context) => createPptCreateJob({ ...context, input: args.input, output: args.output, idempotencyKey: args.idempotencyKey })
  })
});

const REPORT_TOOL_HANDLERS = Object.freeze({
  get_project_audit_report: Object.freeze({ capability: PROJECT_AUDIT_CAPABILITY, label: "project audit", key: "audit", summary: projectAuditSummary }),
  get_ppt_quality_report: Object.freeze({ capability: PPT_QUALITY_CAPABILITY, label: "PPT quality audit", key: "audit", summary: pptQualitySummary }),
  get_ppt_improve_report: Object.freeze({ capability: PPT_IMPROVE_CAPABILITY, label: "PPT improvement", key: "improvement", summary: pptImproveSummary }),
  get_ppt_create_report: Object.freeze({ capability: PPT_CREATE_CAPABILITY, label: "PPT creation", key: "creation", summary: pptCreateSummary })
});

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
  IMAGE_TO_EDITABLE_CAPABILITY,
  LOCAL_REGISTRATIONS,
  PPT_CREATE_CAPABILITY,
  PPT_IMPROVE_CAPABILITY,
  PPT_QUALITY_CAPABILITY,
  PROJECT_AUDIT_CAPABILITY,
  createLocalJob,
  readLocalJob
};
