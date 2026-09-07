import {createArchiveAdmission} from "../../packages/slideclone-core/archive-admission.js";
const admission = createArchiveAdmission(() => ({kind:"pdf", extension:".pdf", pages:null}));
const value = admission.validatePackage("/workspace");
if(value.kind === "raw-image") { const width: number = value.dimensions.widthPx; void width; }
if(value.kind === "raw-document") { const pages: number | null = value.pages; void pages; }
// @ts-expect-error document inspection must provide page count or null
createArchiveAdmission(() => ({kind:"pdf", extension:".pdf", pages:"20"}));
// @ts-expect-error archive root must be a string
admission.validatePackage({});
