"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CAPABILITY_SCOPES } = require("./team-mcp");
const { compileSvgToDeckIr } = require("../slideclone-core/svg/svg-to-deck-ir");
const zlib = require("node:zlib");
const { buildPptxBufferFromDeckIr, buildZipBuffer, renderShapeXml, renderTextBoxXml } = require("../slideclone-core/svg/deck-ir-to-pptx-buffer");
const { readPngBuffer } = require("../slideclone-core/png");
const { createDeckIrFromSvgSlides } = require("../ppt-create-core/svg-deck");
const { createPrintableHtml, effectiveText, effectiveTextBox, effectiveTextRotation, effectiveTextSizePt } = require("../ppt-create-core/export");
const { applyIrEditorPatch, createIrPreviewHtml } = require("../ppt-create-core/ir-editor");
const { createEditableSourceArchive } = require("../slideclone-worker-adapter/team-raw-image-archive");

const PORTAL_OWNER_ID = "portal-web-studio";
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".pdf", ".svg", ".pptx"]);

const CAPABILITY_CATALOG = Object.freeze([
  Object.freeze({
    id: "image-to-editable",
    title: "图片 / PDF / SVG 转可编辑 PPTX",
    badge: "Flagship · Vision + Vector",
    description: "支持单张/多张位图（PNG/JPG/WebP，最多20页）、图片型 PDF（自动按页超分渲染）以及行业标准 SVG 矢量图，一步还原为原生 OpenXML 可编辑形状、连接线、渐变卡片与文本框。",
    inputs: ["单页/多页 PNG·JPG·WebP (1-20页)", "图片型/扫描版 PDF (自动分页)", "SVG 矢量图 / AI 生成 SVG 幻灯片", "结构化 Deck IR (deck.json)"],
    outputs: ["deck.pptx (原生可编辑)", "deck.pdf", "deck.preview.html", "deck.ir.json", "conversion-report.json"],
    tools: ["create_image_to_editable_job", "get_image_to_editable_report", "create_team_upload_target", "create_team_job"],
    claudePlugin: "common-tools-image-to-editable",
    codexPlugin: "image-to-editable",
    cliExample: "node packages/cli/bin/common-tools.js image-to-editable --input ./slide.svg --output ./out-pptx"
  }),
  Object.freeze({
    id: "ppt-create",
    title: "新建演示文稿 & SVG 融合建稿",
    badge: "Creation · SVG Deck Fusion",
    description: "基于结构化 Presentation Spec 或多页 SVG 矢量幻灯片新建演示文稿，支持将 AI 生成的 SVG 架构图/流程图无损编译并嵌入任意幻灯片舞台槽位，输出多主题原生 PPTX。",
    inputs: ["Presentation Spec JSON", "多页 SVG 幻灯片 (svg-deck)", "内嵌 SVG 组件插槽 (embedSvgIntoSlidePage)"],
    outputs: ["deck.pptx", "deck.pdf", "deck.preview.html", "deck.variants.json"],
    tools: ["create_ppt_create_job", "get_ppt_create_report", "createDeckIrFromSvgSlides", "embedSvgIntoSlidePage"],
    claudePlugin: "common-tools-ppt-create",
    codexPlugin: "ppt-create",
    cliExample: "node packages/cli/bin/common-tools.js ppt-create --input ./presentation.json --output ./out-deck"
  }),
  Object.freeze({
    id: "ppt-improve",
    title: "存量 PPT 诊断与版式优化",
    badge: "Refinement",
    description: "解析存量 PPTX 或 Deck IR，自动识别字号层级、对齐偏差、留白失衡与色彩冲突，生成版式重构建议与优化后的可编辑演示文稿。",
    inputs: ["存量 PPTX 文件 (.pptx)"],
    outputs: ["improved-deck.pptx", "ppt-improve-report.json", "ppt-improve-report.md"],
    tools: ["create_ppt_improve_job", "get_ppt_improve_report"],
    claudePlugin: "common-tools-ppt-improve",
    codexPlugin: "ppt-improve",
    cliExample: "node packages/cli/bin/common-tools.js ppt-improve --input ./legacy.pptx --output ./out-improve"
  }),
  Object.freeze({
    id: "ppt-quality",
    title: "演示文稿质量门禁与视觉审计",
    badge: "Quality Gate",
    description: "对生成的 PPTX 执行确定性排版校验、溢出检测、对比度检查与像素级视觉回归评分，输出结构化质量报告。",
    inputs: ["PPTX 演示文稿 (.pptx)"],
    outputs: ["ppt-quality-report.json", "ppt-quality-report.md"],
    tools: ["create_ppt_quality_job", "get_ppt_quality_report"],
    claudePlugin: "common-tools-ppt-quality",
    codexPlugin: "ppt-quality",
    cliExample: "node packages/cli/bin/common-tools.js ppt-quality --input ./deck.pptx --output ./out-quality"
  }),
  Object.freeze({
    id: "project-audit",
    title: "工程交付与架构合规审计",
    badge: "Engineering Audit",
    description: "对工程仓库归档执行架构边界、测试覆盖、安全配置与交付物完整性审计，生成可追溯审计报告。",
    inputs: ["工程归档 (.tar.gz / 目录)"],
    outputs: ["project-audit-report.json", "project-audit-report.md"],
    tools: ["create_project_audit_job", "get_project_audit_report"],
    claudePlugin: "common-tools-project-audit",
    codexPlugin: "project-audit",
    cliExample: "node packages/cli/bin/common-tools.js project-audit --input ./repo --output ./out-audit"
  }),
  Object.freeze({
    id: "siyuan-note",
    title: "思源笔记知识库同步与结构化提取",
    badge: "Knowledge Base",
    description: "连接思源笔记私有服务，执行结构化 Markdown 知识写入、笔记本检索与文档树管理。",
    inputs: ["结构化 Markdown / 笔记本与文档 ID"],
    outputs: ["siyuan-note-report.json", "siyuan-note-report.md"],
    tools: ["siyuan_list_notebooks", "siyuan_create_note", "siyuan_append_markdown"],
    claudePlugin: "common-tools-siyuan-note",
    codexPlugin: "siyuan-note",
    cliExample: "node packages/cli/bin/common-tools.js siyuan-note --help"
  })
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function summarizeDeckIr(deckIr) {
  const pages = Array.isArray(deckIr?.pages) ? deckIr.pages : [];
  let shapesCount = 0;
  let textBoxesCount = 0;
  let gradientsCount = 0;
  let freeformsCount = 0;
  let connectorsCount = 0;
  const groupIds = new Set();

  const pageSummaries = pages.map((page, index) => {
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
    shapesCount += shapes.length;
    textBoxesCount += textBoxes.length;
    for (const s of shapes) {
      if (s.style?.gradient) gradientsCount += 1;
      if (s.type === "freeform") freeformsCount += 1;
      if (s.type === "line" || s.type === "connector") connectorsCount += 1;
      if (s.source?.nativeComponentGroupId) groupIds.add(`${index}:${s.source.nativeComponentGroupId}`);
    }
    for (const t of textBoxes) {
      if (t.source?.nativeComponentGroupId) groupIds.add(`${index}:${t.source.nativeComponentGroupId}`);
    }
    return {
      pageIndex: index,
      background: page.background?.fill || "#FFFFFF",
      shapesCount: shapes.length,
      textBoxesCount: textBoxes.length,
      elements: [
        ...shapes.map((s) => ({
          id: s.id,
          category: "shape",
          kind: s.type,
          box: s.box,
          fill: s.style?.gradient ? `linear-gradient(${s.style.gradient.angleDeg}deg)` : (s.style?.fill || "none"),
          stroke: s.style?.stroke || "none",
          groupId: s.source?.nativeComponentGroupId || null
        })),
        ...textBoxes.map((t) => ({
          id: t.id,
          category: "textBox",
          kind: "text",
          box: t.box,
          text: String(t.text || "").slice(0, 60),
          fontSizePt: t.font?.sizePt || 14,
          color: t.font?.color || "#111827",
          groupId: t.source?.nativeComponentGroupId || null
        }))
      ]
    };
  });

  return {
    stats: {
      pageCount: pages.length,
      shapesCount,
      textBoxesCount,
      groupsCount: groupIds.size,
      gradientsCount,
      freeformsCount,
      connectorsCount
    },
    pages: pageSummaries
  };
}

function compilePortalPayloadToDeckIr(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("request payload must be a JSON object");
  }
  if (Array.isArray(payload.slides) && payload.slides.length > 0) {
    return createDeckIrFromSvgSlides({
      theme: payload.theme || "technical-blue-v1",
      slides: payload.slides
    });
  }
  if (Array.isArray(payload.svgs) && payload.svgs.length > 0) {
    return compileSvgToDeckIr(payload.svgs, {
      title: payload.title || "SVG Multi-Slide Presentation"
    });
  }
  if (typeof payload.svg === "string" && payload.svg.trim()) {
    return compileSvgToDeckIr(payload.svg, {
      title: payload.title || "SVG Editable Slide"
    });
  }
  throw new TypeError("request must provide svg, svgs, or slides");
}

function handlePortalApi(pathname, rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    const err = new Error("invalid JSON body");
    err.statusCode = 400;
    throw err;
  }

  const deckIr = compilePortalPayloadToDeckIr(payload);
  const summary = summarizeDeckIr(deckIr);

  if (pathname === "/portal/api/svg-to-ir") {
    return {
      status: 200,
      body: {
        ok: true,
        stats: summary.stats,
        pages: summary.pages,
        deckIr
      }
    };
  }

  if (pathname === "/portal/api/svg-to-pptx") {
    const pptxBuffer = buildPptxBufferFromDeckIr(deckIr);
    const safeName = String(payload.filename || "editable-slides.pptx")
      .replace(/[^A-Za-z0-9._-\u4e00-\u9fa5]/g, "_")
      .replace(/\.pptx$/i, "") + ".pptx";
    return {
      status: 200,
      body: {
        ok: true,
        filename: safeName,
        sizeBytes: pptxBuffer.length,
        pptxBase64: pptxBuffer.toString("base64"),
        stats: summary.stats,
        pages: summary.pages,
        deckIr
      }
    };
  }

  const err = new Error("unknown portal API endpoint");
  err.statusCode = 404;
  throw err;
}

async function handlePortalEditableJobCreate(rawBody, { teamServices, objectStore } = {}) {
  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    const err = new Error("invalid JSON body");
    err.statusCode = 400;
    throw err;
  }

  const files = Array.isArray(payload?.files) ? payload.files : [];
  if (files.length < 1 || files.length > 20) {
    const err = new Error("请上传 1 至 20 个文件（支持 PNG/JPG/WebP 图片、PDF 文档或 SVG 矢量图）");
    err.statusCode = 400;
    throw err;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-portal-upload-"));
  try {
    const writtenFiles = [];
    for (let i = 0; i < files.length; i += 1) {
      const item = files[i];
      const rawBase64 = typeof item?.contentBase64 === "string"
        ? item.contentBase64
        : (typeof item?.dataBase64 === "string" ? item.dataBase64 : null);
      if (!item || typeof item.name !== "string" || !rawBase64) {
        throw new Error(`第 ${i + 1} 个文件数据格式无效`);
      }
      const ext = path.extname(item.name).toLowerCase();
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
        throw new Error(`不支持的文件后缀 ${ext}（仅支持 .png, .jpg, .jpeg, .pdf, .svg, .pptx）`);
      }
      const buffer = Buffer.from(rawBase64, "base64");
      if (buffer.length < 8 || buffer.length > 25 * 1024 * 1024) {
        throw new Error(`文件 ${item.name} 大小超出限制（单文件需在 25MB 以内）`);
      }
      const safeFile = path.join(tempRoot, `page-${String(i + 1).padStart(3, "0")}${ext}`);
      fs.writeFileSync(safeFile, buffer, { mode: 0o600 });
      writtenFiles.push(safeFile);
    }

    const archivePath = path.join(tempRoot, "editable-input.tar.gz");
    const archiveMeta = createEditableSourceArchive({
      inputFile: writtenFiles.length === 1 ? writtenFiles[0] : undefined,
      inputFiles: writtenFiles.length > 1 ? writtenFiles : undefined,
      outputFile: archivePath
    });
    const archiveBytes = fs.readFileSync(archivePath);

    if (!teamServices || !objectStore) {
      const err = new Error("当前服务未挂载 Team Worker 队列与对象存储，无法异步处理位图/PDF 作业");
      err.statusCode = 503;
      throw err;
    }

    const uploadTarget = await teamServices.createUploadTarget({
      ownerId: PORTAL_OWNER_ID,
      capability: "image-to-editable",
      contentType: "application/gzip",
      contentLength: archiveBytes.length
    });

    await objectStore.putObject({
      objectKey: uploadTarget.objectKey,
      body: archiveBytes,
      contentType: "application/gzip"
    });

    const job = await teamServices.createJob({
      capability: "image-to-editable",
      ownerId: PORTAL_OWNER_ID,
      inputObjectKey: uploadTarget.objectKey,
      idempotencyKey: `portal-job-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    return {
      status: 200,
      body: {
        ok: true,
        job,
        sourceSummary: {
          fileCount: writtenFiles.length,
          pages: archiveMeta.pages || writtenFiles.length,
          archiveBytes: archiveBytes.length,
          sha256: archiveMeta.sha256
        }
      }
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function handlePortalEditableJobStatus(requestUrl, { teamServices } = {}) {
  if (!teamServices) {
    const err = new Error("team services 未启用");
    err.statusCode = 503;
    throw err;
  }
  const hasIdParam = requestUrl.searchParams.has("id");
  const jobId = requestUrl.searchParams.get("id");
  if (!hasIdParam) {
    const rawLimit = Number(requestUrl.searchParams.get("limit"));
    const limit = Number.isSafeInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 50 ? rawLimit : 20;
    const jobs = typeof teamServices.listJobs === "function"
      ? await teamServices.listJobs({
          ownerId: PORTAL_OWNER_ID,
          capability: "image-to-editable",
          limit
        })
      : [];
    return {
      status: 200,
      body: {
        ok: true,
        jobs
      }
    };
  }
  if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
    const err = new Error("job id 参数无效");
    err.statusCode = 400;
    throw err;
  }
  const job = await teamServices.getJob(jobId, PORTAL_OWNER_ID);
  if (!job) {
    const err = new Error("未找到对应的转换任务");
    err.statusCode = 404;
    throw err;
  }
  return {
    status: 200,
    body: {
      ok: true,
      job
    }
  };
}

async function handlePortalEditableJobRetry(requestUrl, rawBody, { teamServices } = {}) {
  if (!teamServices) {
    const err = new Error("team services 未启用");
    err.statusCode = 503;
    throw err;
  }
  let payload = {};
  if (typeof rawBody === "string" && rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      const err = new Error("invalid JSON body");
      err.statusCode = 400;
      throw err;
    }
  }
  const jobId = requestUrl.searchParams.get("id") || (typeof payload?.id === "string" ? payload.id.trim() : "");
  if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
    const err = new Error("job id 参数无效");
    err.statusCode = 400;
    throw err;
  }
  const existing = await teamServices.getJob(jobId, PORTAL_OWNER_ID);
  if (!existing) {
    const err = new Error("未找到对应的转换任务");
    err.statusCode = 404;
    throw err;
  }
  if (existing.status === "queued" || existing.status === "running") {
    return {
      status: 200,
      body: {
        ok: true,
        retried: false,
        alreadyActive: true,
        job: existing
      }
    };
  }
  if (typeof teamServices.retryJob === "function") {
    const retriedJob = await teamServices.retryJob(jobId, PORTAL_OWNER_ID);
    if (retriedJob && retriedJob.status === "queued") {
      return {
        status: 200,
        body: {
          ok: true,
          retried: true,
          job: retriedJob
        }
      };
    }
  }
  if (existing.inputObjectKey && typeof teamServices.createJob === "function") {
    const recreatedJob = await teamServices.createJob({
      capability: existing.capability || "image-to-editable",
      ownerId: PORTAL_OWNER_ID,
      inputObjectKey: existing.inputObjectKey,
      idempotencyKey: `portal-retry-${jobId}-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    return {
      status: 200,
      body: {
        ok: true,
        retried: true,
        recreatedFromJobId: jobId,
        job: recreatedJob
      }
    };
  }
  const err = new Error(`任务当前状态 (${existing.status}) 不支持重试`);
  err.statusCode = 409;
  throw err;
}


const PORTAL_SAVE_TOKEN = "portal-web-studio-save-token";

function normalizePortalEditableIr(ir) {
  if (!ir || !Array.isArray(ir.pages)) return ir;
  for (const page of ir.pages) {
    for (const textBox of page.textBoxes || []) {
      if (!textBox || typeof textBox !== "object") continue;
      if (textBox.source?.portalNormalized === true) continue;
      if (Boolean(textBox.source?.ocrProvider) || Array.isArray(textBox.positionedRuns)) {
        const nextText = effectiveText(textBox);
        const nextBox = effectiveTextBox(textBox);
        const nextRot = effectiveTextRotation(textBox);
        const nextSize = effectiveTextSizePt(textBox);
        textBox.text = nextText;
        if (nextBox) textBox.box = nextBox;
        textBox.rotation = nextRot;
        textBox.font = { ...(textBox.font || {}), sizePt: nextSize };
        delete textBox.positionedRuns;
        textBox.source = { ...(textBox.source || {}), portalNormalized: true };
      }
    }
  }
  return ir;
}

function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return [];
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd >= 0) {
    const entries = [];
    const cdCount = buffer.readUInt16LE(eocd + 10);
    let cdPos = buffer.readUInt32LE(eocd + 16);
    for (let i = 0; i < cdCount && cdPos + 46 <= buffer.length; i += 1) {
      if (buffer.readUInt32LE(cdPos) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(cdPos + 10);
      const compSize = buffer.readUInt32LE(cdPos + 20);
      const nameLen = buffer.readUInt16LE(cdPos + 28);
      const extraLen = buffer.readUInt16LE(cdPos + 30);
      const commentLen = buffer.readUInt16LE(cdPos + 32);
      const localOffset = buffer.readUInt32LE(cdPos + 42);
      const name = buffer.subarray(cdPos + 46, cdPos + 46 + nameLen).toString("utf8");
      if (localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50) {
        const lNameLen = buffer.readUInt16LE(localOffset + 26);
        const lExtraLen = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        if (dataStart + compSize <= buffer.length) {
          const compData = buffer.subarray(dataStart, dataStart + compSize);
          const data = method === 8 ? zlib.inflateRawSync(compData) : Buffer.from(compData);
          entries.push({ name, data });
        }
      }
      cdPos += 46 + nameLen + extraLen + commentLen;
    }
    if (entries.length > 0) return entries;
  }
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart + compSize > buffer.length) break;
    const compData = buffer.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(compData) : Buffer.from(compData);
    entries.push({ name, data });
    offset = dataStart + compSize;
  }
  return entries;
}

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeRgbaToPngBuffer(width, height, rgba) {
  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 6 });
  const makeChunk = (type, data) => {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(pngCrc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

function extractIconsFromResidualPng(pngBuf, page, slideSize) {
  const img = readPngBuffer(pngBuf);
  const { width, height } = img;
  const rgba = Buffer.from(img.rgba);
  const scaleX = width / (Number(slideSize?.widthPt) || 960);
  const scaleY = height / (Number(slideSize?.heightPt) || 540);
  const inText = new Uint8Array(width * height);
  for (const tb of page?.textBoxes || []) {
    const b = effectiveTextBox(tb) || tb?.box;
    if (!b) continue;
    const x0 = Math.max(0, Math.floor(b.x * scaleX));
    const y0 = Math.max(0, Math.floor(b.y * scaleY));
    const x1 = Math.min(width - 1, Math.ceil((b.x + b.w) * scaleX));
    const y1 = Math.min(height - 1, Math.ceil((b.y + b.h) * scaleY));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) inText[y * width + x] = 1;
    }
  }
  const fg = new Uint8Array(width * height);
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      if (inText[y * width + x]) continue;
      const o = (y * width + x) * 4;
      if (rgba[o + 3] < 128) continue;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 222 || sat > 60) fg[y * width + x] = 1;
    }
  }
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const rawBoxes = [];
  for (let i = 0; i < width * height; i += 1) {
    if (!fg[i] || seen[i]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    seen[i] = 1;
    let minX = i % width;
    let maxX = minX;
    let minY = Math.floor(i / width);
    let maxY = minY;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = ny * width + nx;
            if (fg[ni] && !seen[ni]) {
              seen[ni] = 1;
              queue[tail++] = ni;
            }
          }
        }
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (tail >= 8 && w <= 160 && h <= 160 && !(tail < 45 && (w <= 4 || h <= 4))) {
      rawBoxes.push({ x: minX, y: minY, w, h, pixels: tail });
    }
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < rawBoxes.length; i += 1) {
      for (let j = i + 1; j < rawBoxes.length; j += 1) {
        const a = rawBoxes[i];
        const b = rawBoxes[j];
        const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
        const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
        const nx = Math.min(a.x, b.x);
        const ny = Math.min(a.y, b.y);
        const nw = Math.max(a.x + a.w, b.x + b.w) - nx;
        const nh = Math.max(a.y + a.h, b.y + b.h) - ny;
        if (gapX <= Math.round(10 * scaleX) && gapY <= Math.round(10 * scaleY) && (gapX === 0 || gapY === 0) && nw <= 150 && nh <= 150) {
          rawBoxes[i] = { x: nx, y: ny, w: nw, h: nh, pixels: a.pixels + b.pixels };
          rawBoxes.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }
  const icons = [];
  for (const b of rawBoxes) {
    const wPt = b.w / scaleX;
    const hPt = b.h / scaleY;
    const xPt = b.x / scaleX;
    const yPt = b.y / scaleY;
    const ratio = wPt / hPt;
    const density = b.pixels / (b.w * b.h);
    if (wPt < 14 || hPt < 14 || wPt > 115 || hPt > 115 || ratio < 0.45 || ratio > 2.2 || density < 0.08) continue;
    if (yPt > (slideSize?.heightPt || 540) * 0.93 && xPt > (slideSize?.widthPt || 960) * 0.85) continue;
    const pad = 4;
    const x0 = Math.max(0, b.x - pad);
    const y0 = Math.max(0, b.y - pad);
    const x1 = Math.min(width - 1, b.x + b.w + pad - 1);
    const y1 = Math.min(height - 1, b.y + b.h + pad - 1);
    const samples = [];
    for (let x = x0; x <= x1; x += 1) samples.push((y0 * width + x) * 4, (y1 * width + x) * 4);
    for (let y = y0 + 1; y < y1; y += 1) samples.push((y * width + x0) * 4, (y * width + x1) * 4);
    const validSamples = samples.filter((o) => rgba[o + 3] >= 200);
    if (validSamples.length < samples.length * 0.85) continue;
    const rs = validSamples.map((o) => rgba[o]).sort((m, n) => m - n);
    const gs = validSamples.map((o) => rgba[o + 1]).sort((m, n) => m - n);
    const bs = validSamples.map((o) => rgba[o + 2]).sort((m, n) => m - n);
    const bg = [rs[rs.length >> 1], gs[gs.length >> 1], bs[bs.length >> 1]];
    const uniform = validSamples.filter((o) => Math.max(Math.abs(rgba[o] - bg[0]), Math.abs(rgba[o + 1] - bg[1]), Math.abs(rgba[o + 2] - bg[2])) <= 22);
    if (uniform.length < samples.length * 0.82) continue;

    const cropPad = 2;
    const cx0 = Math.max(0, b.x - cropPad);
    const cy0 = Math.max(0, b.y - cropPad);
    const cx1 = Math.min(width - 1, b.x + b.w - 1 + cropPad);
    const cy1 = Math.min(height - 1, b.y + b.h - 1 + cropPad);
    const cw = cx1 - cx0 + 1;
    const ch = cy1 - cy0 + 1;
    const iconRgba = Buffer.alloc(cw * ch * 4);
    for (let py = cy0; py <= cy1; py += 1) {
      for (let px = cx0; px <= cx1; px += 1) {
        const srcOff = (py * width + px) * 4;
        const dstOff = ((py - cy0) * cw + (px - cx0)) * 4;
        const pr = rgba[srcOff];
        const pg = rgba[srcOff + 1];
        const pb = rgba[srcOff + 2];
        const pa = rgba[srcOff + 3];
        const dist = Math.max(Math.abs(pr - bg[0]), Math.abs(pg - bg[1]), Math.abs(pb - bg[2]));
        const alpha = dist <= 18 ? 0 : dist < 46 ? Math.round(((dist - 18) / 28) * pa) : pa;
        iconRgba[dstOff] = pr;
        iconRgba[dstOff + 1] = pg;
        iconRgba[dstOff + 2] = pb;
        iconRgba[dstOff + 3] = alpha;
      }
    }
    for (let py = Math.max(0, b.y - 1); py <= Math.min(height - 1, b.y + b.h); py += 1) {
      for (let px = Math.max(0, b.x - 1); px <= Math.min(width - 1, b.x + b.w); px += 1) {
        const off = (py * width + px) * 4;
        rgba[off] = bg[0];
        rgba[off + 1] = bg[1];
        rgba[off + 2] = bg[2];
        rgba[off + 3] = 255;
      }
    }
    const idx = icons.length + 1;
    const id = `icon-${idx}`;
    const assetPath = `assets/${id}.png`;
    const iconPngBuffer = encodeRgbaToPngBuffer(cw, ch, iconRgba);
    const box = {
      x: Math.round((cx0 / scaleX) * 100) / 100,
      y: Math.round((cy0 / scaleY) * 100) / 100,
      w: Math.round((cw / scaleX) * 100) / 100,
      h: Math.round((ch / scaleY) * 100) / 100
    };
    icons.push({
      id,
      assetPath,
      box,
      pngBuffer: iconPngBuffer,
      dataUri: `data:image/png;base64,${iconPngBuffer.toString("base64")}`,
      irItem: {
        id,
        type: "image",
        assetPath,
        box,
        rotation: 0,
        style: { opacity: 1, fit: "contain", assetPath },
        source: { editable: true, detector: "extracted-card-icon-crop", role: "icon" }
      }
    });
  }
  const residualPngBuffer = icons.length > 0 ? encodeRgbaToPngBuffer(width, height, rgba) : pngBuf;
  return {
    residualPngBuffer,
    residualDataUri: `data:image/png;base64,${residualPngBuffer.toString("base64")}`,
    icons
  };
}

function renderPicXml(img, numericId, rId) {
  const box = img?.box || { x: 0, y: 0, w: 24, h: 24 };
  const x = Math.round((Number(box.x) || 0) * 12700);
  const y = Math.round((Number(box.y) || 0) * 12700);
  const w = Math.max(12700, Math.round((Number(box.w) || 24) * 12700));
  const h = Math.max(12700, Math.round((Number(box.h) || 24) * 12700));
  const rot = Number(img?.rotation) || 0;
  const rotAttr = Number.isFinite(rot) && Math.abs(rot) > 0.001 ? ` rot="${Math.round(rot * 60000)}"` : "";
  const safeName = String(img?.id || `pic-${numericId}`).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<p:pic>` +
      `<p:nvPicPr>` +
        `<p:cNvPr id="${numericId}" name="${safeName}"/>` +
        `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
        `<p:nvPr/>` +
      `</p:nvPicPr>` +
      `<p:blipFill>` +
        `<a:blip r:embed="${rId}"/>` +
        `<a:stretch><a:fillRect/></a:stretch>` +
      `</p:blipFill>` +
      `<p:spPr>` +
        `<a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `</p:spPr>` +
    `</p:pic>`
  );
}

function ensureOpenXmlRootNamespaces(xml, rootTag) {
  return xml.replace(new RegExp(`<${rootTag}\\b([^>]*)>`), (full, attrs) => {
    let next = attrs;
    if (!/\bxmlns:a=/.test(next)) next += ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    if (!/\bxmlns:r=/.test(next)) next += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    return `<${rootTag}${next}>`;
  });
}

function normalizeOpenXmlCommon(xml) {
  return xml
    .replace(/^\uFEFF/, "")
    .replace(
      /<p:grpSpPr>\s*<a:xfrm(?:\s+xmlns:a="[^"]*")?\s*\/>\s*<\/p:grpSpPr>/g,
      "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
    )
    .replace(/<a:chExt cx="0" y="0"\/>/g, '<a:chExt cx="0" cy="0"/>')
    .replace(
      /<a:prstGeom\s+prst="rect"(?:\s+xmlns:a="[^"]*")?\s*\/>/g,
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    );
}

function syncPptxBufferWithDeckIr(pptxBuffer, rawIr, extractedByPage = null) {
  const entries = readZipEntries(pptxBuffer);
  if (!entries.length || !rawIr || !Array.isArray(rawIr.pages)) return pptxBuffer;
  const ir = normalizePortalEditableIr(JSON.parse(JSON.stringify(rawIr)));

  for (const entry of entries) {
    if (entry.name.endsWith(".xml") || entry.name.endsWith(".rels")) {
      let text = entry.data.toString("utf8").replace(/^\uFEFF/, "");
      if (entry.name === "[Content_Types].xml") {
        text = text.replace(
          "application/vnd.openxmlformats-officedocument.drawingml.theme+xml",
          "application/vnd.openxmlformats-officedocument.theme+xml"
        );
      } else if (entry.name === "ppt/presentation.xml") {
        text = ensureOpenXmlRootNamespaces(normalizeOpenXmlCommon(text), "p:presentation")
          .replace(/(<p:sldSz\b[^>]*?)\s+type="custom"/g, "$1");
      } else if (entry.name.startsWith("ppt/slideMasters/") && entry.name.endsWith(".xml")) {
        text = ensureOpenXmlRootNamespaces(normalizeOpenXmlCommon(text), "p:sldMaster");
      } else if (entry.name.startsWith("ppt/slideLayouts/") && entry.name.endsWith(".xml")) {
        text = ensureOpenXmlRootNamespaces(normalizeOpenXmlCommon(text), "p:sldLayout");
      }
      entry.data = Buffer.from(text, "utf8");
    }
  }

  for (let pageIndex = 0; pageIndex < ir.pages.length; pageIndex += 1) {
    const slidePath = `ppt/slides/slide${pageIndex + 1}.xml`;
    const slideRelsPath = `ppt/slides/_rels/slide${pageIndex + 1}.xml.rels`;
    const entry = entries.find((e) => e.name === slidePath);
    if (!entry) continue;
    let relsEntry = entries.find((e) => e.name === slideRelsPath);
    const page = ir.pages[pageIndex];
    const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const images = Array.isArray(page.images) ? page.images : [];
    const movableImages = images.filter((img) => img && img.id && img.id !== "full-slide-residual");
    const tbById = new Map(textBoxes.map((tb) => [tb.id, tb]));
    const shapeById = new Map(shapes.map((sh) => [sh.id, sh]));
    const imgById = new Map(movableImages.map((img) => [img.id, img]));
    const emittedTbIds = new Set();
    const emittedShapeIds = new Set();
    const emittedImgIds = new Set();

    const extracted = Array.isArray(extractedByPage) ? extractedByPage[pageIndex] : null;
    if (extracted && extracted.residualPngBuffer) {
      const mediaEntry = entries.find((e) => e.name === "ppt/media/image.png");
      if (mediaEntry) mediaEntry.data = extracted.residualPngBuffer;
      for (const icon of extracted.icons || []) {
        const mediaName = `ppt/media/${icon.id}.png`;
        const existingMedia = entries.find((e) => e.name === mediaName);
        if (existingMedia) existingMedia.data = icon.pngBuffer;
        else entries.push({ name: mediaName, data: icon.pngBuffer });
      }
    }

    const hasResidualImage = images.some((img) => img && (img.id === "full-slide-residual" || img.source?.fullSlideResidual === true));
    if (!hasResidualImage) {
      const residualMediaIdx = entries.findIndex((e) => e.name === "ppt/media/image.png");
      if (residualMediaIdx >= 0) entries.splice(residualMediaIdx, 1);
    }

    const rIdByIconId = new Map();
    if (relsEntry) {
      let relsXml = relsEntry.data.toString("utf8").replace(/^\uFEFF/, "");
      if (!hasResidualImage) {
        relsXml = relsXml.replace(/<Relationship\b[^>]*\bTarget="[^"]*\/image\.png"[^>]*\/>/g, "");
      }
      for (const m of relsXml.matchAll(/<Relationship\b[^>]*\bTarget="[^"]*\/(icon-\d+)\.png"[^>]*\bId="([^"]+)"/g)) {
        rIdByIconId.set(m[1], m[2]);
      }
      for (const m of relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="[^"]*\/(icon-\d+)\.png"/g)) {
        rIdByIconId.set(m[2], m[1]);
      }
      for (const img of movableImages) {
        const baseIconId = String(img.id).replace(/\.copy\..*$/u, "");
        if (!rIdByIconId.has(baseIconId) && /^icon-\d+$/u.test(baseIconId)) {
          const rId = `rId_${baseIconId.replace(/[^A-Za-z0-9_]/g, "_")}`;
          rIdByIconId.set(baseIconId, rId);
          relsXml = relsXml.replace(
            "</Relationships>",
            `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${baseIconId}.png" Id="${rId}" /></Relationships>`
          );
        }
      }
      relsEntry.data = Buffer.from(relsXml, "utf8");
    }

    let xml = ensureOpenXmlRootNamespaces(normalizeOpenXmlCommon(entry.data.toString("utf8")), "p:sld");
    let maxNumericId = 100;
    for (const idMatch of xml.matchAll(/\bid="(\d+)"/g)) {
      const n = Number(idMatch[1]);
      if (Number.isFinite(n) && n >= maxNumericId) maxNumericId = n + 1;
    }

    xml = xml.replace(/<p:grpSp\b[\s\S]*?<\/p:grpSp>/g, (grpXml) => {
      const grpMatch = grpXml.match(/<p:nvGrpSpPr>\s*<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/);
      if (!grpMatch) return grpXml;
      const numId = Number(grpMatch[1]) || (maxNumericId++);
      const rawName = grpMatch[2];
      const baseId = rawName.replace(/-position-\d+$/u, "");
      if (tbById.has(baseId)) {
        if (emittedTbIds.has(baseId)) return "";
        emittedTbIds.add(baseId);
        return renderTextBoxXml(tbById.get(baseId), numId);
      }
      if (/^p\d+-ocr-\d+/u.test(rawName) || /^text\./u.test(rawName)) {
        return "";
      }
      return grpXml;
    });

    xml = xml.replace(/<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/g, (cxnXml) => {
      const cNvMatch = cxnXml.match(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/);
      if (!cNvMatch) return cxnXml;
      const numId = Number(cNvMatch[1]) || (maxNumericId++);
      const rawName = cNvMatch[2];
      if (shapeById.has(rawName)) {
        if (emittedShapeIds.has(rawName)) return "";
        emittedShapeIds.add(rawName);
        return renderShapeXml(shapeById.get(rawName), numId);
      }
      return "";
    });

    xml = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (spXml) => {
      const cNvMatch = spXml.match(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/);
      if (!cNvMatch) return spXml;
      const numId = Number(cNvMatch[1]) || (maxNumericId++);
      const rawName = cNvMatch[2];
      const baseId = rawName.replace(/-position-\d+$/u, "");
      if (tbById.has(baseId)) {
        if (emittedTbIds.has(baseId)) return "";
        emittedTbIds.add(baseId);
        return renderTextBoxXml(tbById.get(baseId), numId);
      }
      if (shapeById.has(rawName)) {
        if (emittedShapeIds.has(rawName)) return "";
        emittedShapeIds.add(rawName);
        return renderShapeXml(shapeById.get(rawName), numId);
      }
      return "";
    });

    xml = xml.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (picXml) => {
      const cNvMatch = picXml.match(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"/);
      if (!cNvMatch) return picXml;
      const numId = Number(cNvMatch[1]) || (maxNumericId++);
      const rawName = cNvMatch[2];
      if (rawName === "full-slide-residual") return hasResidualImage ? picXml : "";
      const rIdMatch = picXml.match(/\br:embed="([^"]+)"/);
      const baseIconId = rawName.replace(/\.copy\..*$/u, "");
      const rId = rIdMatch ? rIdMatch[1] : rIdByIconId.get(baseIconId);
      if (imgById.has(rawName) && rId) {
        if (emittedImgIds.has(rawName)) return "";
        emittedImgIds.add(rawName);
        return renderPicXml(imgById.get(rawName), numId, rId);
      }
      if (/^icon-\d+/u.test(rawName)) {
        return "";
      }
      return picXml;
    });

    const shapeAdditions = [];
    for (const sh of shapes) {
      if (sh && sh.id && !emittedShapeIds.has(sh.id)) {
        emittedShapeIds.add(sh.id);
        shapeAdditions.push(renderShapeXml(sh, maxNumericId++));
      }
    }
    const picAdditions = [];
    for (const img of movableImages) {
      if (img && img.id && !emittedImgIds.has(img.id)) {
        const baseIconId = String(img.id).replace(/\.copy\..*$/u, "");
        const rId = rIdByIconId.get(baseIconId);
        if (rId) {
          emittedImgIds.add(img.id);
          picAdditions.push(renderPicXml(img, maxNumericId++, rId));
        }
      }
    }
    const tbAdditions = [];
    for (const tb of textBoxes) {
      if (tb && tb.id && !emittedTbIds.has(tb.id)) {
        emittedTbIds.add(tb.id);
        tbAdditions.push(renderTextBoxXml(tb, maxNumericId++));
      }
    }
    if (shapeAdditions.length > 0) {
      xml = xml.replace(/(<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>)/, `$1${shapeAdditions.join("")}`);
    }
    if (picAdditions.length > 0) {
      xml = xml.replace("</p:spTree>", `${picAdditions.join("")}</p:spTree>`);
    }
    if (tbAdditions.length > 0) {
      xml = xml.replace("</p:spTree>", `${tbAdditions.join("")}</p:spTree>`);
    }
    // Ensure z-order inside <p:spTree>: nvGrpSpPr + grpSpPr -> shapes/connectors -> pics -> textBoxes
    const spTreeMatch = xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
    if (spTreeMatch) {
      const inner = spTreeMatch[1];
      const headerMatch = inner.match(/^(\s*<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>)/);
      if (headerMatch) {
        const header = headerMatch[1];
        const rest = inner.slice(header.length);
        const elemRegex = /<p:(?:sp|cxnSp|pic|grpSp)\b[\s\S]*?<\/p:(?:sp|cxnSp|pic|grpSp)>/g;
        const elems = rest.match(elemRegex) || [];
        const shapeElems = [];
        const picElems = [];
        const textElems = [];
        for (const el of elems) {
          if (el.startsWith("<p:pic")) {
            picElems.push(el);
          } else if (el.startsWith("<p:cxnSp")) {
            shapeElems.push(el);
          } else {
            const nameMatch = el.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/);
            const nm = nameMatch ? nameMatch[1] : "";
            if (shapeById.has(nm)) shapeElems.push(el);
            else textElems.push(el);
          }
        }
        xml = xml.replace(/<p:spTree>[\s\S]*?<\/p:spTree>/, `<p:spTree>${header}${shapeElems.join("")}${picElems.join("")}${textElems.join("")}</p:spTree>`);
      }
    }
    entry.data = Buffer.from(xml, "utf8");
  }
  return buildZipBuffer(entries);
}

async function ensureJobEditableIconsAndPptx(jobId, { teamServices, objectStore }) {
  const irTarget = await teamServices.getArtifactTarget({ id: jobId, ownerId: PORTAL_OWNER_ID, name: "deck.ir.json" });
  const irBytes = await objectStore.readObject({ objectKey: irTarget.objectKey, maxBytes: 16 * 1024 * 1024 });
  const ir = normalizePortalEditableIr(JSON.parse(irBytes.toString("utf8")));
  if (!ir || !Array.isArray(ir.pages) || ir.pages.length === 0) return { ir, irTarget };
  const hasFullResidual = (ir.pages[0].images || []).some((img) => img?.id === "full-slide-residual" || img?.source?.fullSlideResidual === true);
  if (ir.meta?.portalNativeSceneUpgraded === true && !hasFullResidual && (ir.pages[0].images || []).length > 0) return { ir, irTarget };

  try {
    const pptxTarget = await teamServices.getArtifactTarget({ id: jobId, ownerId: PORTAL_OWNER_ID, name: "deck.pptx" });
    const pptxBytes = await objectStore.readObject({ objectKey: pptxTarget.objectKey, maxBytes: 100 * 1024 * 1024 });
    const entries = readZipEntries(pptxBytes);
    const mediaEntry = entries.find((e) => e.name === "ppt/media/image.png");
    let sourcePngBuffer = mediaEntry ? mediaEntry.data : null;
    try {
      const job = await teamServices.getJob(jobId, PORTAL_OWNER_ID);
      if (job?.inputObjectKey) {
        const archiveBytes = await objectStore.readObject({ objectKey: job.inputObjectKey, maxBytes: 64 * 1024 * 1024 });
        const srcImg = extractSourceImageFromTarGz(archiveBytes);
        if (srcImg && srcImg.contentType === "image/png") {
          sourcePngBuffer = srcImg.bytes;
        }
      }
    } catch {
      // Fallback to mediaEntry if source archive is unavailable
    }

    let extracted = null;
    if (sourcePngBuffer && (ir.pages[0].images || []).filter((img) => img?.id !== "full-slide-residual").length === 0) {
      extracted = extractIconsFromResidualPng(sourcePngBuffer, ir.pages[0], ir.slideSize);
      ir.pages[0].images = extracted.icons.map((ic) => ic.irItem);
    }
    const { extractDiagramNativeScene, makeTransparentIconCrop } = require("../slideclone-core/diagram-native-scene-extractor");
    const scene = extractDiagramNativeScene({ page: ir.pages[0], slideSize: ir.slideSize });
    if (scene && Array.isArray(scene.shapes) && scene.shapes.length > 0) {
      ir.pages[0].shapes = scene.shapes;
      ir.pages[0].images = scene.images;
      ir.pages[0].textBoxes = scene.textBoxes;
      if (sourcePngBuffer) {
        try {
          const raster = readPngBuffer(sourcePngBuffer);
          const croppedIcons = [];
          for (const img of ir.pages[0].images) {
            if (!img?.id || !img?.box) continue;
            const container = scene.shapes.find((s) =>
              s.type === "roundRect"
              && img.box.x >= s.box.x - 4
              && img.box.y >= s.box.y - 4
              && img.box.x + img.box.w <= s.box.x + s.box.w + 4
              && img.box.y + img.box.h <= s.box.y + s.box.h + 4
            );
            const cropped = makeTransparentIconCrop(raster, ir.slideSize, img.box, container?.style?.fill);
            const pngBuffer = encodeRgbaToPngBuffer(cropped.width, cropped.height, cropped.rgba);
            croppedIcons.push({ id: String(img.id).replace(/\.copy\..*$/u, ""), pngBuffer });
          }
          if (croppedIcons.length > 0) {
            extracted = { residualPngBuffer: sourcePngBuffer, icons: croppedIcons };
          }
        } catch {
          // Keep existing extracted icons if source crop fails
        }
      }
    } else {
      ir.pages[0].images = (ir.pages[0].images || []).filter((img) => img?.id !== "full-slide-residual" && img?.source?.fullSlideResidual !== true);
    }
    ir.meta = {
      ...(ir.meta || {}),
      portalIconsExtracted: true,
      portalNativeSceneUpgraded: true,
      fullSlideResidualOmitted: true,
      extractedIconCount: (ir.pages[0].images || []).length
    };

    const updatedPptx = syncPptxBufferWithDeckIr(pptxBytes, ir, extracted ? [extracted] : null);
    await objectStore.putObject({
      objectKey: pptxTarget.objectKey,
      body: updatedPptx,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
    await objectStore.putObject({
      objectKey: irTarget.objectKey,
      body: Buffer.from(`${JSON.stringify(ir, null, 2)}\n`, "utf8"),
      contentType: "application/json"
    });
  } catch {
    // Fallback if icon extraction encounters an unexpected format.
  }
  return { ir, irTarget };
}

function extractSourceImageFromTarGz(archiveBytes) {
  const tar = zlib.gunzipSync(archiveBytes);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "").trim();
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim();
    const size = parseInt(sizeOctal || "0", 8) || 0;
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tar.length) break;
    const ext = path.extname(name).toLowerCase();
    if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      return {
        bytes: Buffer.from(tar.subarray(bodyStart, bodyEnd)),
        contentType: ext === ".png" ? "image/png" : "image/jpeg",
        filename: path.basename(name)
      };
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

async function handlePortalEditableSave(requestUrl, rawBody, { teamServices, objectStore, sessionToken } = {}) {
  const jobId = requestUrl.searchParams.get("id");
  if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
    const err = new Error("job id 参数无效");
    err.statusCode = 400;
    throw err;
  }
  if (sessionToken !== undefined && sessionToken !== PORTAL_SAVE_TOKEN) {
    const err = new Error("编辑会话令牌无效");
    err.statusCode = 403;
    throw err;
  }
  if (!teamServices || !objectStore) {
    const err = new Error("team services 未启用");
    err.statusCode = 503;
    throw err;
  }
  let patch;
  try {
    patch = JSON.parse(rawBody || "{}");
  } catch {
    const err = new Error("invalid JSON patch body");
    err.statusCode = 400;
    throw err;
  }
  const { ir: rawIr, irTarget } = await ensureJobEditableIconsAndPptx(jobId, { teamServices, objectStore });
  const backgroundImagesByPage = rawIr.pages.map((p) =>
    (Array.isArray(p.images) ? p.images : []).filter((img) => img?.id === "full-slide-residual")
  );
  const editableIr = {
    ...rawIr,
    pages: rawIr.pages.map((p) => ({
      ...p,
      images: (Array.isArray(p.images) ? p.images : []).filter((img) => img?.id !== "full-slide-residual")
    }))
  };
  const applied = applyIrEditorPatch(editableIr, patch);
  const mergedIr = {
    ...applied.ir,
    pages: applied.ir.pages.map((p, idx) => ({
      ...p,
      images: [...(backgroundImagesByPage[idx] || []), ...(Array.isArray(p.images) ? p.images : [])]
    }))
  };
  await objectStore.putObject({
    objectKey: irTarget.objectKey,
    body: Buffer.from(`${JSON.stringify(mergedIr, null, 2)}\n`, "utf8"),
    contentType: "application/json"
  });
  return {
    status: 200,
    body: {
      ok: true,
      code: "EXPORT_COMPLETED",
      output: "deck.pptx & deck.ir.json (已同步至云端产物)",
      revision: applied.revision,
      operationCount: applied.operationCount
    }
  };
}

async function handlePortalEditableArtifact(requestUrl, { teamServices, objectStore } = {}) {
  const jobId = requestUrl.searchParams.get("id");
  const name = requestUrl.searchParams.get("name") || "deck.pptx";
  if (!jobId || !/^[a-f0-9-]{36}$/i.test(jobId)) {
    const err = new Error("job id 参数无效");
    err.statusCode = 400;
    throw err;
  }
  if (!teamServices || !objectStore) {
    const err = new Error("team services 未启用");
    err.statusCode = 503;
    throw err;
  }
  if (name === "source.png") {
    const job = await teamServices.getJob(jobId, PORTAL_OWNER_ID);
    if (!job || !job.inputObjectKey) {
      const err = new Error("未找到原始输入归档");
      err.statusCode = 404;
      throw err;
    }
    const archiveBytes = await objectStore.readObject({
      objectKey: job.inputObjectKey,
      maxBytes: 64 * 1024 * 1024
    });
    const extracted = extractSourceImageFromTarGz(archiveBytes);
    if (!extracted) {
      const err = new Error("当前任务输入源不是位图格式");
      err.statusCode = 404;
      throw err;
    }
    return {
      status: 200,
      headers: {
        "Content-Type": extracted.contentType,
        "Content-Disposition": `inline; filename="${extracted.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
        "Content-Length": String(extracted.bytes.length)
      },
      bodyBuffer: extracted.bytes
    };
  }
  const target = await teamServices.getArtifactTarget({
    id: jobId,
    ownerId: PORTAL_OWNER_ID,
    name
  });
  let bytes = await objectStore.readObject({
    objectKey: target.objectKey,
    maxBytes: 100 * 1024 * 1024
  });
  if (name === "deck.preview.html" || name === "deck.html" || name === "deck.ir.json" || name === "deck.pptx") {
    try {
      const { ir } = await ensureJobEditableIconsAndPptx(jobId, { teamServices, objectStore });
      bytes = await objectStore.readObject({
        objectKey: target.objectKey,
        maxBytes: 100 * 1024 * 1024
      });
      if (ir && Array.isArray(ir.pages)) {
        if (name === "deck.ir.json") {
          bytes = Buffer.from(`${JSON.stringify(ir, null, 2)}\n`, "utf8");
        } else if (name === "deck.pptx") {
          bytes = syncPptxBufferWithDeckIr(bytes, ir);
        } else {
          const storedHtml = bytes.toString("utf8");
          const srcById = new Map();
          for (const m of storedHtml.matchAll(/<img\b[^>]*\bdata-object-id="([^"]+)"[^>]*\bsrc="([^"]+)"/g)) {
            srcById.set(m[1], m[2]);
          }
          for (const m of storedHtml.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*\bdata-object-id="([^"]+)"/g)) {
            srcById.set(m[2], m[1]);
          }
          const missingMediaIds = ir.pages.flatMap((page) => (page.images || []).map((img) => String(img?.id || "").replace(/\.copy\..*$/u, ""))).filter((id) => id && !srcById.has(id));
          if (missingMediaIds.length > 0) {
            try {
              const pptxTarget = await teamServices.getArtifactTarget({ id: jobId, ownerId: PORTAL_OWNER_ID, name: "deck.pptx" });
              const pptxBytes = await objectStore.readObject({ objectKey: pptxTarget.objectKey, maxBytes: 100 * 1024 * 1024 });
              for (const entry of readZipEntries(pptxBytes)) {
                const m = entry.name.match(/^ppt\/media\/(icon-\d+)\.png$/u);
                if (m && !srcById.has(m[1])) {
                  srcById.set(m[1], `data:image/png;base64,${entry.data.toString("base64")}`);
                }
              }
            } catch {
              // Ignore media fallback errors
            }
          }
          const slideW = Number(ir.slideSize?.widthPt) || 960;
          const slideH = Number(ir.slideSize?.heightPt) || 540;
          const bgImageTagsByPage = ir.pages.map((page) => (page.images || []).map((img) => {
            const id = String(img?.id || "");
            if (id !== "full-slide-residual") return "";
            const src = srcById.get(id) || img.dataUri;
            if (!src) return "";
            return `<img class="image" data-object-id="full-slide-residual" alt="" src="${src}" style="pointer-events:none;z-index:1;left:0%;top:0%;width:100%;height:100%;object-fit:contain">`;
          }).join(""));
          const fgImageTagsByPage = ir.pages.map((page) => (page.images || []).map((img) => {
            const id = String(img?.id || "");
            if (!id || id === "full-slide-residual") return "";
            const baseId = id.replace(/\.copy\..*$/u, "");
            const src = srcById.get(id) || srcById.get(baseId) || img.dataUri;
            if (!src) return "";
            const box = img.box || { x: 0, y: 0, w: 24, h: 24 };
            const rot = Number(img.rotation) || 0;
            const rotCss = Number.isFinite(rot) && Math.abs(rot) > 0.01 ? `;transform:rotate(${rot}deg)` : "";
            const style = `z-index:2;cursor:move;left:${box.x / slideW * 100}%;top:${box.y / slideH * 100}%;width:${box.w / slideW * 100}%;height:${box.h / slideH * 100}%;object-fit:contain${rotCss}`;
            return `<img class="image" data-object-id="${escapeHtml(id)}" alt="" src="${src}" style="${style}">`;
          }).join(""));
          const editableIr = {
            ...ir,
            pages: ir.pages.map((page) => ({
              ...page,
              images: (Array.isArray(page.images) ? page.images : []).filter((img) => img?.id !== "full-slide-residual")
            }))
          };
          let html = name === "deck.preview.html"
            ? createIrPreviewHtml(editableIr, {
                sessionEndpoint: `/portal/api/editable-save?id=${jobId}`,
                sessionToken: PORTAL_SAVE_TOKEN
              })
            : createPrintableHtml(editableIr);
          for (let pageIndex = 0; pageIndex < ir.pages.length; pageIndex += 1) {
            const bgTags = bgImageTagsByPage[pageIndex];
            const fgTags = fgImageTagsByPage[pageIndex];
            if (bgTags || fgTags) {
              html = html.replace(
                new RegExp(`(<section class="slide" data-page-index="${pageIndex}"[^>]*>)([\\s\\S]*?)(<\\/section>)`),
                (_, openTag, innerHtml, closeTag) => `${openTag}${bgTags || ""}${innerHtml}${fgTags || ""}${closeTag}`
              );
            }
          }
          bytes = Buffer.from(html, "utf8");
        }
      }
    } catch {
      // Fallback to stored artifact bytes when dynamic preview synthesis is unavailable.
    }
  }
  const mediaTypes = {
    "deck.pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "deck.pdf": "application/pdf",
    "deck.preview.html": "text/html; charset=utf-8",
    "deck.html": "text/html; charset=utf-8",
    "deck.ir.json": "application/json; charset=utf-8",
    "conversion-report.json": "application/json; charset=utf-8",
    "conversion-report.md": "text/markdown; charset=utf-8"
  };
  const inline = requestUrl.searchParams.get("inline") === "1";
  const disposition = inline
    ? `inline; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`
    : `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`;
  return {
    status: 200,
    headers: {
      "Content-Type": mediaTypes[name] || "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Length": String(bytes.length)
    },
    bodyBuffer: bytes
  };
}

function portalMetadata(config, environment = process.env) {
  const origin = config.publicUrl.origin;
  const enabledSet = Array.isArray(config.enabledCapabilities)
    ? new Set(config.enabledCapabilities)
    : new Set(Object.keys(CAPABILITY_SCOPES));

  const capabilities = CAPABILITY_CATALOG.map((item) => ({
    id: item.id,
    title: item.title,
    badge: item.badge,
    enabled: enabledSet.has(item.id),
    scope: CAPABILITY_SCOPES[item.id] || `common-tools:${item.id}`,
    description: item.description,
    inputs: item.inputs,
    outputs: item.outputs,
    tools: item.tools,
    cliExample: item.cliExample,
    plugins: {
      claudeCode: item.claudePlugin,
      codex: item.codexPlugin
    }
  }));

  return Object.freeze({
    service: "common-tools",
    version: "0.1.0",
    environment: environment.NODE_ENV === "development" ? "development" : "production",
    endpoints: {
      portal: `${origin}/`,
      portalMetadata: `${origin}/portal.json`,
      editableJobsApi: `${origin}/portal/api/editable-jobs`,
      editableRetryApi: `${origin}/portal/api/editable-retry`,
      editableArtifactApi: `${origin}/portal/api/editable-artifact`,
      editableSaveApi: `${origin}/portal/api/editable-save`,
      svgToIrApi: `${origin}/portal/api/svg-to-ir`,
      svgToPptxApi: `${origin}/portal/api/svg-to-pptx`,
      mcp: `${origin}/mcp`,
      oauthProtectedResource: `${origin}/.well-known/oauth-protected-resource/mcp`,
      healthz: `${origin}/healthz`,
      readyz: `${origin}/readyz`,
      issuer: config.issuer
    },
    features: {
      imageAndPdfUploadToPptx: true,
      clipboardImagePaste: true,
      conversionHistory: true,
      historyVisualThumbnails: true,
      uploadQueuePageReorder: true,
      pureNativeZeroBackdropResidual: true,
      transparentIconExtraction: true,
      failedJobRetry: true,
      liveWorkbenchCloudSave: true,
      sideBySideSourceCompare: true,
      multiPageImageToPptx: true,
      pdfToEditablePptx: true,
      svgToEditablePptx: true,
      svgSlideDeckCreation: true,
      liveBrowserPptxExport: true,
      interactiveCapabilityQuickLaunch: true,
      maxPagesPerBatch: 20
    },
    capabilities
  });
}

const { createPortalHtmlRenderer } = require("./portal-html");
const renderPortalHtml = createPortalHtmlRenderer({ portalMetadata });

module.exports = {
  CAPABILITY_CATALOG,
  compilePortalPayloadToDeckIr,
  handlePortalApi,
  handlePortalEditableArtifact,
  handlePortalEditableJobCreate,
  handlePortalEditableJobRetry,
  handlePortalEditableSave,
  syncPptxBufferWithDeckIr,
  handlePortalEditableJobStatus,
  portalMetadata,
  renderPortalHtml,
  summarizeDeckIr
};

