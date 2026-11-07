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
            `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="/ppt/media/${baseIconId}.png" Id="${rId}" /></Relationships>`
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
  if (ir.meta?.portalNativeSceneUpgraded === true && !hasFullResidual) return { ir, irTarget };

  try {
    const pptxTarget = await teamServices.getArtifactTarget({ id: jobId, ownerId: PORTAL_OWNER_ID, name: "deck.pptx" });
    const pptxBytes = await objectStore.readObject({ objectKey: pptxTarget.objectKey, maxBytes: 100 * 1024 * 1024 });
    const entries = readZipEntries(pptxBytes);
    const mediaEntry = entries.find((e) => e.name === "ppt/media/image.png");
    let extracted = null;
    if (mediaEntry && (ir.pages[0].images || []).filter((img) => img?.id !== "full-slide-residual").length === 0) {
      extracted = extractIconsFromResidualPng(mediaEntry.data, ir.pages[0], ir.slideSize);
      ir.pages[0].images = extracted.icons.map((ic) => ic.irItem);
    }
    const { extractDiagramNativeScene } = require("../slideclone-core/diagram-native-scene-extractor");
    const scene = extractDiagramNativeScene({ page: ir.pages[0], slideSize: ir.slideSize });
    if (scene && Array.isArray(scene.shapes) && scene.shapes.length > 0) {
      ir.pages[0].shapes = scene.shapes;
      ir.pages[0].images = scene.images;
      ir.pages[0].textBoxes = scene.textBoxes;
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
          const slideW = Number(ir.slideSize?.widthPt) || 960;
          const slideH = Number(ir.slideSize?.heightPt) || 540;
          const imageTagsByPage = ir.pages.map((page) => (page.images || []).map((img) => {
            const id = String(img?.id || "");
            if (!id) return "";
            const baseId = id.replace(/\.copy\..*$/u, "");
            const src = srcById.get(id) || srcById.get(baseId) || img.dataUri;
            if (!src) return "";
            if (id === "full-slide-residual") {
              return `<img class="image" data-object-id="full-slide-residual" alt="" src="${src}" style="pointer-events:none;z-index:1;left:0%;top:0%;width:100%;height:100%;object-fit:contain">`;
            }
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
            const tags = imageTagsByPage[pageIndex];
            if (tags) {
              html = html.replace(
                new RegExp(`(<section class="slide" data-page-index="${pageIndex}"[^>]*>)`),
                `$1${tags}`
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

function renderPortalHtml(config, environment = process.env) {
  const meta = portalMetadata(config, environment);
  const categoryMap = {
    "image-to-editable": "vision",
    "ppt-create": "ppt",
    "ppt-improve": "ppt",
    "ppt-quality": "ppt",
    "project-audit": "governance",
    "siyuan-note": "governance"
  };
  const studioQuickLaunchMap = {
    "image-to-editable": { tab: "tab-upload-converter", label: "🚀 在线上传体验" },
    "ppt-create": { tab: "tab-ppt-fusion", label: "✨ 打开融合建稿台" },
    "ppt-improve": { tab: "tab-pipeline-builder", cmdType: "ppt-improve", label: "⚡ 生成优化调用" },
    "ppt-quality": { tab: "tab-svg-converter", label: "🎨 打开矢量编译台" },
    "project-audit": { tab: "tab-pipeline-builder", cmdType: "single-image", label: "🛠️ 查看调用示例" },
    "siyuan-note": { tab: "tab-plugins-hub", label: "🔌 查看接入配置" }
  };
  const cardsHtml = meta.capabilities.map((cap) => {
    const statusClass = cap.enabled ? "status-on" : "status-off";
    const statusText = cap.enabled ? "已启用 (Active)" : "未启用 (Disabled)";
    const category = categoryMap[cap.id] || "all";
    const quick = studioQuickLaunchMap[cap.id];
    const inputsHtml = cap.inputs.map((inp) => `<span class="chip">${escapeHtml(inp)}</span>`).join("");
    const outputsHtml = cap.outputs.map((out) => `<code class="out-chip">${escapeHtml(out)}</code>`).join("");
    const toolsHtml = (cap.tools || []).map((t) => `<code class="tool-chip">${escapeHtml(t)}</code>`).join("");
    const searchBlob = `${cap.id} ${cap.title} ${cap.badge} ${cap.description} ${(cap.tools || []).join(" ")}`.toLowerCase();
    const quickBtnHtml = quick
      ? `<button class="btn-mini" style="background:rgba(59,130,246,0.22);border-color:#3b82f6;color:#e0f2fe;font-weight:600" type="button" onclick="quickLaunchCapability('${escapeHtml(quick.tab)}', '${escapeHtml(quick.cmdType || "")}')">${escapeHtml(quick.label)}</button>`
      : "";
    return `
      <article class="cap-card" data-category="${escapeHtml(category)}" data-search="${escapeHtml(searchBlob)}">
        <div class="cap-header">
          <div>
            <span class="cap-badge">${escapeHtml(cap.badge)}</span>
            <h3>${escapeHtml(cap.title)}</h3>
            <div class="cap-id">ID: <code>${escapeHtml(cap.id)}</code> · Scope: <code>${escapeHtml(cap.scope)}</code></div>
          </div>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>
        <p class="cap-desc">${escapeHtml(cap.description)}</p>
        <div class="cap-meta-group">
          <div class="meta-label">支持输入源</div>
          <div class="chip-row">${inputsHtml}</div>
        </div>
        <div class="cap-meta-group">
          <div class="meta-label">交付产物</div>
          <div class="chip-row">${outputsHtml}</div>
        </div>
        <div class="cap-meta-group">
          <div class="meta-label">核心工具 / API</div>
          <div class="chip-row">${toolsHtml}</div>
        </div>
        <div class="cap-footer">
          <div>Claude: <code>${escapeHtml(cap.plugins.claudeCode)}</code> · Codex: <code>${escapeHtml(cap.plugins.codex)}</code></div>
          <div class="btn-group">
            ${quickBtnHtml}
            <button class="btn-mini" type="button" onclick="copyText('${escapeHtml(cap.cliExample)}', this)">复制 CLI 命令</button>
          </div>
        </div>
      </article>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Common Tools · 企业级插件中心与图片/PDF/SVG 转可编辑 PPT 工作台</title>
  <style>
    :root {
      --bg: #070b16;
      --bg-card: #10182d;
      --bg-panel: #0b1120;
      --bg-input: #060a13;
      --border: #1e2d52;
      --border-light: #2d4379;
      --text: #eef2ff;
      --text-muted: #8ea0c8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-soft: rgba(59, 130, 246, 0.16);
      --accent: #10b981;
      --accent-soft: rgba(16, 185, 129, 0.16);
      --purple: #a78bfa;
      --amber: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at 15% 0%, #152347 0%, var(--bg) 55%);
      color: var(--text);
      line-height: 1.55;
    }
    .container {
      max-width: 1360px;
      margin: 0 auto;
      padding: 24px 24px 72px;
    }
    header.hero {
      background: linear-gradient(135deg, rgba(21, 35, 71, 0.92), rgba(11, 17, 32, 0.96));
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px 28px;
      margin-bottom: 18px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-soft);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.4);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    h1 {
      margin: 10px 0 6px;
      font-size: 25px;
      font-weight: 700;
    }
    .hero-sub {
      margin: 0;
      color: var(--text-muted);
      max-width: 900px;
      font-size: 13.8px;
    }
    .telemetry-bar {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .telemetry-item {
      background: rgba(7, 11, 22, 0.78);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px 13px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .telemetry-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .telemetry-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #93c5fd;
      word-break: break-all;
    }
    /* Main Navigation Tabs */
    .nav-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      flex-wrap: wrap;
    }
    .nav-tab {
      background: var(--bg-card);
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-tab:hover {
      color: var(--text);
      border-color: var(--border-light);
    }
    .nav-tab.active {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      border-color: #60a5fa;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .studio-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }
    /* Dropzone for Image & PDF Upload */
    .dropzone {
      border: 2px dashed #3b82f6;
      background: rgba(37, 99, 235, 0.07);
      border-radius: 14px;
      padding: 28px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 16px;
    }
    .dropzone:hover, .dropzone.dragover {
      background: rgba(37, 99, 235, 0.16);
      border-color: #60a5fa;
    }
    .dropzone-title {
      font-size: 17px;
      font-weight: 700;
      color: #e0f2fe;
      margin-bottom: 6px;
    }
    .dropzone-sub {
      font-size: 13px;
      color: var(--text-muted);
    }
    .upload-queue {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .upload-item {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
    }
    .upload-thumb {
      width: 100%;
      height: 100px;
      background: #060a13;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 13px;
      color: #93c5fd;
      font-weight: 600;
    }
    .upload-thumb img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .upload-meta {
      font-size: 12px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .upload-size {
      font-size: 11px;
      color: var(--text-muted);
    }
    .job-tracker {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-top: 14px;
    }
    .history-panel {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-top: 18px;
    }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }
    .history-card {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      transition: all 0.15s ease;
    }
    .history-card:hover {
      border-color: var(--border-light);
    }
    .history-card.active-job {
      border-color: var(--primary);
      background: rgba(59, 130, 246, 0.10);
      box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35);
    }
    .history-info {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 260px;
      flex: 1;
    }
    .history-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .history-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11.8px;
      color: var(--text-muted);
    }
    .history-metric-tag {
      background: #0d162c;
      border: 1px solid #1e2d52;
      color: #bfdbfe;
      padding: 2px 8px;
      border-radius: 5px;
      font-size: 11.5px;
    }
    .history-thumb-box {
      width: 124px;
      height: 70px;
      border-radius: 8px;
      background: #050912;
      border: 1px solid #243662;
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
    }
    .history-thumb-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .kpi-strip {
      margin-top: 14px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
    }
    .kpi-card {
      background: linear-gradient(135deg, rgba(16, 24, 45, 0.92), rgba(7, 11, 22, 0.92));
      border: 1px solid rgba(59, 130, 246, 0.32);
      border-radius: 12px;
      padding: 11px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-title {
      font-size: 11.5px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kpi-val {
      font-size: 15px;
      font-weight: 700;
      color: #eef2ff;
    }
    .kpi-sub {
      font-size: 11.5px;
      color: #93c5fd;
    }
    .step-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
      margin: 12px 0;
    }
    .step-box {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12.5px;
      color: var(--text-muted);
    }
    .step-box.active {
      border-color: #3b82f6;
      color: #93c5fd;
      background: rgba(59, 130, 246, 0.12);
      font-weight: 600;
    }
    .step-box.done {
      border-color: #10b981;
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.12);
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    button.btn, label.btn-upload, a.btn-link {
      background: #172342;
      color: var(--text);
      border: 1px solid #2b4075;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    button.btn:hover, label.btn-upload:hover, a.btn-link:hover {
      background: #21325e;
      border-color: var(--primary);
    }
    button.btn.primary, a.btn-link.primary {
      background: var(--primary);
      border-color: #60a5fa;
      color: #fff;
      font-weight: 600;
    }
    button.btn.success, a.btn-link.success {
      background: #059669;
      border-color: #34d399;
      color: #fff;
      font-weight: 600;
    }
    button.btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.btn-mini {
      background: #162240;
      color: #93c5fd;
      border: 1px solid #293e73;
      border-radius: 6px;
      padding: 3px 9px;
      font-size: 11.5px;
      cursor: pointer;
    }
    .page-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .page-pill {
      background: #16203a;
      color: var(--text-muted);
      border: 1px solid #25355e;
      border-radius: 7px;
      padding: 4px 11px;
      font-size: 12px;
      cursor: pointer;
    }
    .page-pill.active {
      background: var(--primary-soft);
      color: #93c5fd;
      border-color: var(--primary);
      font-weight: 600;
    }
    .studio-grid {
      display: grid;
      grid-template-columns: 1fr 1.15fr;
      gap: 16px;
    }
    @media (max-width: 980px) {
      .studio-grid { grid-template-columns: 1fr; }
    }
    .pane {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pane-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: 6px;
    }
    textarea.code-editor {
      width: 100%;
      height: 350px;
      background: var(--bg-input);
      color: #bfdbfe;
      border: 1px solid #1b2848;
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      resize: vertical;
    }
    .svg-stage-preview {
      background: #e2e8f0;
      border-radius: 8px;
      min-height: 235px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 10px;
    }
    .svg-stage-preview svg {
      max-width: 100%;
      max-height: 250px;
      height: auto;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      border-radius: 4px;
      background: #fff;
    }
    .ir-stats {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .stat-badge {
      background: var(--accent-soft);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #6ee7b7;
      padding: 3px 9px;
      border-radius: 6px;
      font-weight: 500;
    }
    .inspector-box {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .element-list {
      background: var(--bg-input);
      border: 1px solid #1b2848;
      border-radius: 8px;
      padding: 8px;
      max-height: 165px;
      overflow-y: auto;
      font-size: 11.5px;
    }
    .el-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 6px;
      border-bottom: 1px solid rgba(30, 45, 82, 0.45);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    pre.json-viewer {
      margin: 0;
      background: var(--bg-input);
      border: 1px solid #1b2848;
      border-radius: 8px;
      padding: 10px;
      font-size: 11.5px;
      color: #a5b4fc;
      max-height: 165px;
      overflow: auto;
    }
    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .form-field label {
      font-size: 12px;
      color: var(--text-muted);
    }
    .form-field input, .form-field select {
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 8px 10px;
      font-size: 13px;
    }
    .cap-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 16px;
    }
    .cap-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 11px;
    }
    .cap-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .cap-badge {
      font-size: 11px;
      color: var(--purple);
      font-weight: 600;
      text-transform: uppercase;
    }
    .cap-card h3 { margin: 3px 0; font-size: 16.5px; }
    .cap-id { font-size: 11.5px; color: var(--text-muted); }
    .status-pill {
      font-size: 11.5px;
      padding: 3px 10px;
      border-radius: 999px;
      white-space: nowrap;
      font-weight: 600;
    }
    .status-on {
      background: var(--accent-soft);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .status-off {
      background: rgba(148, 163, 196, 0.12);
      color: var(--text-muted);
    }
    .cap-desc { margin: 0; font-size: 13px; color: #cbd5e1; }
    .meta-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .chip {
      font-size: 11.5px;
      background: var(--primary-soft);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #bfdbfe;
      padding: 2px 8px;
      border-radius: 5px;
    }
    .out-chip, .tool-chip {
      font-size: 11px;
      background: #080d1a;
      border: 1px solid #1e2d52;
      color: #93c5fd;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .tool-chip { color: #c4b5fd; }
    .cap-footer {
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid rgba(30, 45, 82, 0.65);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--text-muted);
      flex-wrap: wrap;
      gap: 8px;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #059669;
      color: #fff;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      display: none;
      z-index: 999;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <div class="hero-top">
        <div>
          <span class="brand-tag">COMMON TOOLS · ENTERPRISE MCP PORTAL &amp; PPTX STUDIO v${escapeHtml(meta.version)}</span>
          <h1>企业级文档与演示文稿可编辑化插件中心</h1>
          <p class="hero-sub">
            全面支持 <strong>单/多页图片上传 (PNG/JPG/WebP)</strong>、<strong>图片型 PDF 上传分页超分还原</strong>、<strong>行业 SVG 矢量在线直转</strong> 与 <strong>新建 PPT × SVG 混合建稿</strong>，在浏览器内一键上传并导出 100% 原生可编辑 <code>.pptx</code>。
          </p>
        </div>
        <div class="btn-group">
          <span class="status-pill status-on" id="live-health-badge">● 服务在线 (${escapeHtml(meta.environment)})</span>
          <button class="btn" type="button" onclick="probeServices()">🔄 实时探针检测</button>
        </div>
      </div>

      <div class="telemetry-bar">
        <div class="telemetry-item">
          <span class="telemetry-label">Streamable HTTP MCP 端点 <button class="btn-mini" onclick="copyText('${escapeHtml(meta.endpoints.mcp)}', this)">复制</button></span>
          <span class="telemetry-value">${escapeHtml(meta.endpoints.mcp)}</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">OAuth 2.1 资源元数据 <span style="color:#34d399">就绪</span></span>
          <span class="telemetry-value">${escapeHtml(meta.endpoints.oauthProtectedResource)}</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">OIDC 认证中心 (Keycloak)</span>
          <span class="telemetry-value">${escapeHtml(meta.endpoints.issuer)}</span>
        </div>
        <div class="telemetry-item">
          <span class="telemetry-label">健康探针 (/healthz &amp; /readyz)</span>
          <span class="telemetry-value" id="probe-latency-text">点击右上角「实时探针检测」查看延迟</span>
        </div>
      </div>

      <div class="kpi-strip">
        <div class="kpi-card">
          <div class="kpi-title"><span>🎯 纯原生图元重建引擎</span><span class="status-pill status-on" style="padding:1px 8px;font-size:10.5px">0 整页背景残留</span></div>
          <div class="kpi-val">100% OpenXML 原生图形</div>
          <div class="kpi-sub">矢量圆角卡片 · 正交箭头连接线 · 透明底独立可拖拽图标</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title"><span>⚡ 云端转换与图元统计</span><span style="color:#6ee7b7;font-size:11px">实时同步</span></div>
          <div class="kpi-val" id="hero-live-stats-val">正在统计云端转换任务...</div>
          <div class="kpi-sub" id="hero-live-stats-sub">点击下方历史记录卡片可秒级恢复在线编辑</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title"><span>🖼️ 多模态输入与批量合成</span><span style="color:#c4b5fd;font-size:11px">1–20 页/批</span></div>
          <div class="kpi-val">Ctrl+V 截图 · PNG/JPG · PDF · SVG</div>
          <div class="kpi-sub">支持队列自由调序、同屏原图对比与在线工作台 Ctrl+S 云端保存</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title"><span>🔌 已启用插件能力矩阵</span><button type="button" class="btn-mini" onclick="quickLaunchCapability('tab-plugins-hub', '')">查看配置</button></div>
          <div class="kpi-val">${meta.capabilities.filter((c) => c.enabled).length} / ${meta.capabilities.length} 核心插件就绪</div>
          <div class="kpi-sub">全面适配 Claude Code · Codex · Cursor · Antigravity</div>
        </div>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="nav-tabs">
      <button class="nav-tab active" type="button" onclick="switchTab('tab-upload-converter', this)">
        📸 1. 图片 / PDF / 多页图上传转可编辑 PPTX
      </button>
      <button class="nav-tab" type="button" onclick="switchTab('tab-svg-converter', this)">
        🎨 2. SVG 矢量在线编辑与毫秒级直转 PPTX
      </button>
      <button class="nav-tab" type="button" onclick="switchTab('tab-ppt-fusion', this)">
        ✨ 3. 新建 PPT × SVG 融合建稿工作台 (ppt-create)
      </button>
      <button class="nav-tab" type="button" onclick="switchTab('tab-pipeline-builder', this)">
        🖼️ 4. 全通路 CLI 命令与 MCP 载荷生成器
      </button>
      <button class="nav-tab" type="button" onclick="switchTab('tab-plugins-hub', this)">
        🔌 5. 插件市场与客户端配置 (${meta.capabilities.length})
      </button>
    </nav>

    <!-- TAB 1: IMAGE & PDF UPLOAD TO EDITABLE PPTX -->
    <section id="tab-upload-converter" class="tab-panel active">
      <div class="studio-card">
        <div class="toolbar">
          <div>
            <h3 style="margin:0 0 4px">📸 上传图片 (单页/多页 PNG·JPG·WebP) 或 PDF 文档 → 高保真可编辑 PPTX</h3>
            <span style="font-size:13px;color:var(--text-muted)">
              直连后台 Docker 视觉重建集群（PaddleOCR + PDFium 2x 超分 + SAM 语义分割 + OpenXmlDeckBuilder），将位图或扫描版 PDF 还原为可拖拽卡片、连接线与原生文本框。
            </span>
          </div>
          <div class="btn-group">
            <button class="btn primary" type="button" onclick="pasteFromClipboardButton()">
              📋 从剪贴板粘贴图片 (Ctrl+V)
            </button>
            <button class="btn" type="button" onclick="clearUploadQueue()">清空待上传列表</button>
            <button class="btn success" type="button" id="btn-start-upload-job" onclick="submitUploadConversionJob()" disabled>
              🚀 开始高保真转换可编辑 PPTX
            </button>
          </div>
        </div>

        <!-- Benchmark Sample Showcase Bar -->
        <div class="page-bar" style="justify-content:space-between;background:linear-gradient(90deg,rgba(30,58,138,0.28),rgba(6,78,59,0.24));border-color:rgba(59,130,246,0.38)">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:12.5px;font-weight:600;color:#93c5fd">🌟 经典架构图纯原生重建样板间：</span>
            <button type="button" class="btn-mini" style="background:rgba(37,99,235,0.25);border-color:#3b82f6;color:#e0f2fe" onclick="loadBenchmarkSampleJob('af80ca54-d74e-4227-9ddd-a8c4cb9a70d5', false)">① 路由器层四步拆解图 (20原生图形 + 4透明图标)</button>
            <button type="button" class="btn-mini" style="background:rgba(16,185,129,0.22);border-color:#10b981;color:#d1fae5" onclick="loadBenchmarkSampleJob('1051b8bc-446c-44b8-a9be-bc40b59610e2', false)">② Agent Harness 架构全景图 (48原生图形 + 17正交连线 + 12透明图标)</button>
          </div>
          <div class="btn-group">
            <button type="button" class="btn-mini" onclick="loadBenchmarkSampleJob(activePreviewJobId || '1051b8bc-446c-44b8-a9be-bc40b59610e2', true)">⚖️ 一键原图 vs 纯原生同屏对比</button>
            <button type="button" class="btn-mini" onclick="toggleJobIrInspector(true)">🔍 检视透明抠图图标与原生图元</button>
          </div>
        </div>

        <!-- Drag & Drop Zone -->
        <div class="dropzone" id="upload-dropzone" onclick="document.getElementById('file-picker-input').click()">
          <input
            type="file"
            id="file-picker-input"
            accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.pptx,image/png,image/jpeg,image/webp,application/pdf,image/svg+xml"
            multiple
            style="display:none"
            onchange="handleMediaFilesSelected(event.target.files)"
          />
          <div class="dropzone-title">📥 点击选择、拖拽文件，或直接按 <kbd style="background:#1e293b;border:1px solid #475569;border-radius:5px;padding:2px 7px;font-size:13px;color:#93c5fd">Ctrl+V</kbd> 粘贴剪贴板截图/图片</div>
          <div class="dropzone-sub">
            支持：<strong>剪贴板截图连续粘贴（Snipaste / 微信 / Win+Shift+S 截图直接 Ctrl+V 追加多页）</strong> · <strong>单张或多张图片批量上传（PNG / JPG / WebP，1–20 页按顺序合成同一个 PPTX）</strong> · <strong>PDF 文档（.pdf）</strong> · <strong>SVG 矢量图（.svg）</strong>
          </div>
        </div>

        <!-- Selected Files Queue -->
        <div id="upload-queue-summary" class="page-bar" style="display:none;justify-content:space-between"></div>
        <div id="upload-queue-container" class="upload-queue"></div>

        <!-- Live Job Progress & Delivery Panel -->
        <div class="job-tracker" id="upload-job-tracker" style="display:none">
          <div class="pane-header" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <strong id="job-title-label" style="color:#eef2ff;font-size:14px">正在执行高保真可编辑化重建...</strong>
              <button type="button" class="btn primary" id="btn-retry-active-job" style="display:none;padding:5px 12px;font-size:12.5px" onclick="retryConversionJob(activePreviewJobId, this)">🔄 重试该任务</button>
            </div>
            <span id="job-id-badge" style="font-family:monospace;font-size:12px;color:#93c5fd"></span>
          </div>

          <div class="step-list">
            <div class="step-box" id="job-step-1">① 源文件校验与受控归档 (.tar.gz)</div>
            <div class="step-box" id="job-step-2">② 写入对象存储并投递 Worker 队列</div>
            <div class="step-box" id="job-step-3">③ AI 视觉识别 / PDF超分 / 原生形状重建</div>
            <div class="step-box" id="job-step-4">④ OpenXML PPTX 生成与质量门禁校验</div>
          </div>

          <div id="job-artifacts-bar" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="toolbar" style="margin-bottom:10px">
              <div style="display:flex;flex-direction:column;gap:6px">
                <span style="font-size:13.5px;font-weight:600;color:#34d399">🎉 转换完成！点击下方按钮下载可编辑产物：</span>
                <div class="history-metrics" id="job-active-metrics-strip"></div>
              </div>
              <div class="btn-group" id="job-download-buttons"></div>
            </div>
            <div class="pane" id="job-preview-frame-wrap" style="display:none">
              <div class="pane-header" style="flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span>重建幻灯片在线工作台 (<code>deck.preview.html</code>)</span>
                  <span style="font-size:11.5px;color:#6ee7b7" id="job-save-sync-hint">💡 修改文字/字号/位置后点击工作台内「保存新版本并导出 (Ctrl+S)」即可同步更新 PPTX</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <button type="button" class="btn-mini" id="btn-toggle-ir-inspector" onclick="toggleJobIrInspector()">🔍 检视透明图标与原生图元</button>
                  <button type="button" class="btn-mini" id="btn-toggle-canvas-height" onclick="toggleWorkbenchCanvasHeight()">📏 展开大画布 (860px)</button>
                  <button type="button" class="btn-mini" id="btn-toggle-compare" onclick="toggleSourceComparison()">⚖️ 同屏对比原图与可编辑结果</button>
                  <a id="job-open-preview-tab" href="#" target="_blank" style="color:#93c5fd;font-size:12px">在新窗口打开全屏工作台 ↗</a>
                </div>
              </div>
              <div id="job-ir-inspector-drawer" style="display:none;background:#070c18;border:1px solid #243662;border-radius:10px;padding:12px;margin-bottom:8px">
                <div class="pane-header" style="margin-bottom:8px">
                  <strong style="color:#eef2ff;font-size:13px">🧩 当前文稿原生 OpenXML 图元 &amp; 透明抠图图标实时检视器 (<code>deck.ir.json</code>)</strong>
                  <span style="font-size:11.5px;color:#6ee7b7" id="job-ir-inspector-summary">正在读取 Deck IR...</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">
                  <div>
                    <div class="meta-label">🖼️ 独立透明底抠图图标 (<code>page.images</code> · 棋盘格预览)</div>
                    <div id="job-ir-icons-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(95px,1fr));gap:8px;background:#050811;border:1px solid #1b2848;border-radius:8px;padding:8px;max-height:190px;overflow-y:auto"></div>
                  </div>
                  <div>
                    <div class="meta-label">📐 原生矢量卡片 / 徽章 / 正交连接线 (<code>page.shapes</code>)</div>
                    <div id="job-ir-shapes-list" class="element-list" style="max-height:190px"></div>
                  </div>
                  <div>
                    <div class="meta-label">🔤 原生可编辑文本框 (<code>page.textBoxes</code>)</div>
                    <div id="job-ir-texts-list" class="element-list" style="max-height:190px"></div>
                  </div>
                </div>
              </div>
              <div id="job-compare-grid" style="display:grid;grid-template-columns:1fr;gap:12px;align-items:start">
                <div id="job-source-compare-pane" style="display:none;background:#070c18;border:1px solid #1e2d52;border-radius:8px;padding:10px">
                  <div style="font-size:12px;color:#93c5fd;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between">
                    <span>🖼️ 原始上传图像 (Source Image)</span>
                    <span style="color:var(--text-muted)">用于像素级对照排版与文本还原度</span>
                  </div>
                  <img id="job-source-compare-img" alt="原始上传图像" style="width:100%;height:auto;border-radius:6px;display:block;border:1px solid #1e293b" />
                </div>
                <iframe id="job-preview-iframe" style="width:100%;height:580px;border:1px solid #1e2d52;border-radius:8px;background:#fff"></iframe>
              </div>
            </div>
          </div>
        </div>

        <!-- Conversion History Panel -->
        <div class="history-panel" id="upload-history-panel">
              <div class="toolbar" style="margin-bottom:0">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <strong style="color:#eef2ff;font-size:14.5px">🕘 已转换历史记录 (点击即可恢复在线工作台预览与下载产物)</strong>
                  <span class="chip" id="history-count-badge">正在读取历史...</span>
                </div>
                <div class="btn-group">
                  <input type="text" id="history-search-input" placeholder="🔍 搜索任务 ID..." oninput="renderConversionHistoryList()" style="background:#070b14;border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:8px;font-size:12px;width:160px" />
                  <select id="history-status-filter" onchange="renderConversionHistoryList()" style="background:#070b14;border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:8px;font-size:12px">
                    <option value="all">全部状态</option>
                    <option value="ready">✓ 已完成 (可下载 PPTX)</option>
                    <option value="running">⏳ 转换进行中</option>
                    <option value="failed">✕ 转换失败 / 未完成</option>
                  </select>
                  <button class="btn" type="button" onclick="loadConversionHistory({ autoSelectLatest: false })">🔄 刷新历史记录</button>
                </div>
              </div>
              <div id="upload-history-list" class="history-list">
                <div style="color:var(--text-muted);font-size:13px;padding:8px 0">正在从服务端加载最近转换记录...</div>
              </div>
            </div>
      </div>
    </section>

    <!-- TAB 2: SVG TO PPTX LIVE CONVERTER -->
    <section id="tab-svg-converter" class="tab-panel">
      <div class="studio-card">
        <div class="toolbar">
          <div class="btn-group">
            <span style="font-size:12.5px;color:var(--text-muted);font-weight:600">行业预设模板：</span>
            <button class="btn" type="button" onclick="loadSvgPreset('arch')">① AI Agent 四层架构图</button>
            <button class="btn" type="button" onclick="loadSvgPreset('flow')">② 云原生贝塞尔拓扑图</button>
            <button class="btn" type="button" onclick="loadSvgPreset('kpi')">③ 经营数据与矢量图表看板</button>
            <button class="btn" type="button" onclick="loadSvgPreset('roadmap')">④ 产品演进路线泳道图</button>
            <button class="btn" type="button" onclick="loadMultiSlidePreset()">⑤ 多页完整汇报套装 (3页连播)</button>
          </div>
          <div class="btn-group">
            <label class="btn-upload">
              📂 导入本地 .svg (可多选)
              <input type="file" accept=".svg,image/svg+xml" multiple style="display:none" onchange="handleSvgFilesUpload(event)" />
            </label>
            <button class="btn" type="button" onclick="downloadCurrentSvg()">下载当前 .svg</button>
            <button class="btn primary" type="button" onclick="downloadCompiledIr()">导出 Deck IR (deck.json)</button>
            <button class="btn success" type="button" id="btn-export-pptx" onclick="exportLivePptx()">🎯 立即生成并下载可编辑 .pptx</button>
          </div>
        </div>

        <div class="page-bar">
          <span style="font-size:12px;color:var(--text-muted)">当前演示文稿页列表：</span>
          <div id="slide-pills-container" class="btn-group"></div>
          <button class="btn-mini" type="button" onclick="addBlankSvgSlide()">+ 新增一页 SVG 幻灯片</button>
          <button class="btn-mini" type="button" onclick="removeCurrentSvgSlide()">- 删除当前页</button>
          <span style="margin-left:auto;font-size:12px;color:#93c5fd" id="compile-status-label">服务端实时编译器就绪</span>
        </div>

        <div class="studio-grid">
          <div class="pane">
            <div class="pane-header">
              <span>SVG 矢量源码编辑器 (支持 <code>viewBox</code>, <code>linearGradient</code>, <code>marker</code>, <code>g</code>, <code>rect</code>, <code>circle</code>, <code>line</code>, <code>path</code>, <code>text</code>)</span>
              <span id="svg-byte-count">0 bytes</span>
            </div>
            <textarea id="svg-editor" class="code-editor" spellcheck="false" oninput="scheduleServerCompile()"></textarea>
          </div>

          <div class="pane">
            <div class="pane-header">
              <span>实时矢量画布预览 (16:9 幻灯片比例)</span>
              <div class="ir-stats" id="live-ir-stats"></div>
            </div>
            <div class="svg-stage-preview" id="svg-live-preview"></div>

            <div class="inspector-box">
              <div>
                <div class="pane-header" style="margin-bottom:4px">
                  <span>编译提取的原生 PowerPoint 图元清单</span>
                  <span id="element-count-label"></span>
                </div>
                <div class="element-list" id="element-inspector-list"></div>
              </div>
              <div>
                <div class="pane-header" style="margin-bottom:4px">
                  <span>服务端真实 Deck IR (<code>deck.json</code>)</span>
                </div>
                <pre class="json-viewer" id="real-ir-json"></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 3: PPT-CREATE + SVG FUSION STUDIO -->
    <section id="tab-ppt-fusion" class="tab-panel">
      <div class="studio-card">
        <div class="toolbar">
          <div>
            <h3 style="margin:0 0 4px">✨ 新建 PPT × SVG 融合建稿工作台 (<code>createDeckIrFromSvgSlides</code>)</h3>
            <span style="font-size:13px;color:var(--text-muted)">
              将标准 PPT 主题母版（原生标题栏、副标题摘要、页码、配色体系）与 AI 生成的 SVG 核心图表无缝融合，一键输出多页原生可编辑 <code>.pptx</code>。
            </span>
          </div>
          <div class="btn-group">
            <button class="btn primary" type="button" onclick="previewFusionDeck()">🔄 刷新融合编译预览</button>
            <button class="btn success" type="button" onclick="exportFusionPptx()">🎯 合成并下载融合版 .pptx</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>演示文稿官方主题 (Theme Registry)</label>
            <select id="fusion-theme" onchange="previewFusionDeck()">
              <option value="technical-blue-v1">technical-blue-v1 (科技深海蓝)</option>
              <option value="executive-slate-v1">executive-slate-v1 (高管岩灰)</option>
              <option value="editorial-warm-v1">editorial-warm-v1 (人文暖棕)</option>
              <option value="forest-sage-v1">forest-sage-v1 (森系翠绿)</option>
            </select>
          </div>
          <div class="form-field">
            <label>当前页建稿模式 (Slide Mode)</label>
            <select id="fusion-mode" onchange="updateFusionSlideField()">
              <option value="stage">svg-stage-v1 (原生主题标题栏 + 摘要 + 舞台内嵌 SVG 图表)</option>
              <option value="full-canvas">full-canvas (整页 SVG 自由画布)</option>
            </select>
          </div>
          <div class="form-field">
            <label>当前页主标题 (Title)</label>
            <input type="text" id="fusion-title" value="企业级 AI Agent 四层技术架构全景" oninput="updateFusionSlideField()" />
          </div>
          <div class="form-field">
            <label>当前页核心结论摘要 (Summary)</label>
            <input type="text" id="fusion-summary" value="通过统一网关层、治理层、Runtime 循环与资源执行层，实现安全可控的智能体落地" oninput="updateFusionSlideField()" />
          </div>
        </div>

        <div class="page-bar">
          <span style="font-size:12px;color:var(--text-muted)">融合文稿页切换：</span>
          <div id="fusion-pills" class="btn-group"></div>
          <span style="margin-left:auto;font-size:12px;color:#6ee7b7" id="fusion-status">已就绪</span>
        </div>

        <div class="studio-grid">
          <div class="pane">
            <div class="pane-header">
              <span>当前页嵌入的舞台 SVG 源码 (自动按 <code>slotBox</code> 缩放映射为原生图形)</span>
            </div>
            <textarea id="fusion-svg-editor" class="code-editor" spellcheck="false" oninput="updateFusionSlideField()"></textarea>
          </div>
          <div class="pane">
            <div class="pane-header">
              <span>融合编译结果统计 (含原生主题标题栏 + 舞台内嵌 SVG 图元)</span>
              <div class="ir-stats" id="fusion-stats"></div>
            </div>
            <div class="svg-stage-preview" id="fusion-preview-box" style="flex-direction:column;align-items:stretch;background:#f1f5f9;padding:16px"></div>
            <div class="pane-header">
              <span>融合后的完整 Deck IR (可直接用于 <code>ppt-create</code> / <code>OpenXmlDeckBuilder</code>)</span>
            </div>
            <pre class="json-viewer" id="fusion-ir-json"></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 4: MULTI-FORMAT PIPELINE & COMMAND GENERATOR -->
    <section id="tab-pipeline-builder" class="tab-panel">
      <div class="studio-card">
        <h3 style="margin-top:0">🖼️ 单/多页位图 · 图片型 PDF · SVG 矢量全通路转换命令与 MCP 报文生成器</h3>
        <p style="font-size:13.5px;color:var(--text-muted);margin-top:4px">
          根据您的输入源类型自动生成本地 CLI 命令、归档打包脚本以及远程 Team MCP 的标准 JSON-RPC 调用序列。
        </p>

        <div class="form-row">
          <div class="form-field">
            <label>选择转换能力与输入源类型</label>
            <select id="cmd-source-type" onchange="updateCommandBuilder()">
              <option value="single-image">1. 单张图片转可编辑 PPTX (.png / .jpg / .webp)</option>
              <option value="batch-images">2. 多页图片批量转多页 PPTX (1–20 张有序图片)</option>
              <option value="pdf-doc">3. 图片型/扫描版 PDF 转多页可编辑 PPTX (.pdf 自动超分分页)</option>
              <option value="svg-file">4. 行业 SVG 矢量图转原生 PPTX (单页或多页 .svg)</option>
              <option value="ppt-create">5. 新建演示文稿 (Presentation Spec JSON)</option>
              <option value="ppt-improve">6. 存量 PPTX 诊断与版式重构优化 (.pptx)</option>
            </select>
          </div>
          <div class="form-field">
            <label>输入文件路径 (Input Path)</label>
            <input type="text" id="cmd-input-path" value="./architecture.png" oninput="updateCommandBuilder()" />
          </div>
          <div class="form-field">
            <label>输出目录或归档路径 (Output Path)</label>
            <input type="text" id="cmd-output-path" value="./editable-deck-out" oninput="updateCommandBuilder()" />
          </div>
        </div>

        <div class="studio-grid">
          <div class="pane">
            <div class="pane-header">
              <span>方式 A：本地 CLI &amp; 归档打包一键执行脚本</span>
              <button class="btn-mini" type="button" onclick="copyText(document.getElementById('cli-cmd-preview').textContent, this)">复制脚本</button>
            </div>
            <pre class="json-viewer" id="cli-cmd-preview" style="max-height:280px;color:#93c5fd"></pre>
          </div>
          <div class="pane">
            <div class="pane-header">
              <span>方式 B：远程 Team MCP 标准 JSON-RPC 调用序列 (<code>POST /mcp</code>)</span>
              <button class="btn-mini" type="button" onclick="copyText(document.getElementById('mcp-rpc-preview').textContent, this)">复制报文</button>
            </div>
            <pre class="json-viewer" id="mcp-rpc-preview" style="max-height:280px;color:#6ee7b7"></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 5: PLUGIN MARKETPLACE & CLIENT CONFIGURATOR -->
    <section id="tab-plugins-hub" class="tab-panel">
      <div class="studio-card">
        <div class="toolbar">
          <div>
            <h3 style="margin:0 0 4px">🔌 客户端一键接入配置生成 (Claude Code / Codex / Cursor / Antigravity)</h3>
            <span style="font-size:13px;color:var(--text-muted)">选择您的 AI 编程宿主客户端，一键复制对应的插件安装命令或 <code>mcpServers</code> 配置文件。</span>
          </div>
          <div class="btn-group">
            <button class="btn" type="button" onclick="showClientConfig('claude')">Claude Code</button>
            <button class="btn" type="button" onclick="showClientConfig('codex')">Codex CLI</button>
            <button class="btn" type="button" onclick="showClientConfig('mcpjson')">MCP JSON (Cursor / Antigravity / Windsurf)</button>
            <button class="btn" type="button" onclick="showClientConfig('httpcurl')">HTTP API 直连 cURL</button>
            <button class="btn" type="button" onclick="showClientConfig('bundle')">远程插件打包分发命令</button>
          </div>
        </div>
        <div class="pane">
          <div class="pane-header">
            <span id="client-config-title">客户端接入配置</span>
            <button class="btn-mini" type="button" onclick="copyText(document.getElementById('client-config-code').textContent, this)">一键复制配置</button>
          </div>
          <pre class="json-viewer" id="client-config-code" style="max-height:220px;color:#bfdbfe"></pre>
        </div>
      </div>

      <div class="page-bar" style="justify-content:space-between;margin-bottom:16px">
        <div class="btn-group" id="cap-category-pills">
          <span style="font-size:12px;color:var(--text-muted)">能力分类筛选：</span>
          <button type="button" class="page-pill active" data-cat="all" onclick="setCapabilityCategoryFilter('all', this)">全部插件 (${meta.capabilities.length})</button>
          <button type="button" class="page-pill" data-cat="vision" onclick="setCapabilityCategoryFilter('vision', this)">📸 视觉与矢量重建</button>
          <button type="button" class="page-pill" data-cat="ppt" onclick="setCapabilityCategoryFilter('ppt', this)">✨ PPT 建稿与质量门禁</button>
          <button type="button" class="page-pill" data-cat="governance" onclick="setCapabilityCategoryFilter('governance', this)">🛡️ 工程审计与知识库</button>
        </div>
        <input type="text" id="cap-search-input" placeholder="🔍 搜索插件名称 / ID / 工具名..." oninput="filterCapabilityCards()" style="background:#070b14;border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:8px;font-size:12px;width:240px" />
      </div>

      <div class="cap-grid" id="cap-cards-grid">
        ${cardsHtml}
      </div>
    </section>
  </div>

  <div class="toast" id="toast-msg">已复制到剪贴板</div>

  <script>
    const MCP_ENDPOINT = ${JSON.stringify(meta.endpoints.mcp)};
    const OAUTH_METADATA_URL = ${JSON.stringify(meta.endpoints.oauthProtectedResource)};

    // --- TAB 1: IMAGE & PDF UPLOAD STATE & HANDLERS ---
    let uploadedFilesQueue = [];
    let activeJobPollTimer = null;

    const dropzone = document.getElementById("upload-dropzone");
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer?.files?.length) {
        handleMediaFilesSelected(e.dataTransfer.files);
      }
    });

    let clipboardSeqCounter = 1;

    function extensionFromMimeType(mimeType, fallbackName = "") {
      const m = String(mimeType || "").toLowerCase();
      if (m === "image/png") return ".png";
      if (m === "image/jpeg" || m === "image/jpg") return ".jpg";
      if (m === "image/webp") return ".webp";
      if (m === "image/svg+xml") return ".svg";
      if (m === "application/pdf") return ".pdf";
      const extMatch = /\\.(png|jpg|jpeg|webp|pdf|svg|pptx)$/i.exec(fallbackName);
      return extMatch ? extMatch[0].toLowerCase() : ".png";
    }

    function normalizeClipboardBlobToFile(blob, suggestedName = "") {
      const ext = extensionFromMimeType(blob.type, suggestedName);
      const rawName = suggestedName && /\\.(png|jpg|jpeg|webp|pdf|svg|pptx)$/i.test(suggestedName) && !/^image\\.(png|jpg|jpeg|webp)$/i.test(suggestedName)
        ? suggestedName
        : \`clipboard-page-\${String(clipboardSeqCounter++).padStart(2, "0")}\${ext}\`;
      return new File([blob], rawName, { type: blob.type || "image/png" });
    }

    function flashDropzoneHighlight() {
      dropzone.classList.add("dragover");
      setTimeout(() => dropzone.classList.remove("dragover"), 420);
    }

    window.addEventListener("paste", async (e) => {
      const cd = e.clipboardData;
      if (!cd) return;

      const extractedFiles = [];
      if (cd.items && cd.items.length) {
        for (const item of Array.from(cd.items)) {
          if (item.kind === "file") {
            const blob = item.getAsFile();
            if (blob) {
              extractedFiles.push(normalizeClipboardBlobToFile(blob, blob.name));
            }
          }
        }
      }
      if (!extractedFiles.length && cd.files && cd.files.length) {
        for (const f of Array.from(cd.files)) {
          extractedFiles.push(normalizeClipboardBlobToFile(f, f.name));
        }
      }

      // If user pasted raw <svg> markup while not typing inside a text input/textarea
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      const isEditingText = activeTag === "textarea" || activeTag === "input";
      if (!extractedFiles.length && !isEditingText) {
        const plain = cd.getData("text/plain")?.trim() || "";
        if (plain.startsWith("<svg") && plain.includes("</svg>")) {
          const svgBlob = new Blob([plain], { type: "image/svg+xml" });
          extractedFiles.push(normalizeClipboardBlobToFile(svgBlob, \`clipboard-svg-\${String(clipboardSeqCounter++).padStart(2, "0")}.svg\`));
        }
      }

      if (!extractedFiles.length) return;

      e.preventDefault();
      const uploadTabPanel = document.getElementById("tab-upload-converter");
      if (uploadTabPanel && !uploadTabPanel.classList.contains("active")) {
        const firstTabBtn = document.querySelector(".nav-tabs .nav-tab");
        if (firstTabBtn) switchTab("tab-upload-converter", firstTabBtn);
      }
      flashDropzoneHighlight();
      await handleMediaFilesSelected(extractedFiles);
      showToast(\`📋 已从剪贴板粘贴 \${extractedFiles.length} 个文件到待转换队列\`);
    });

    async function pasteFromClipboardButton() {
      if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
        showToast("当前浏览器环境请直接按键盘 Ctrl+V (或 Cmd+V) 粘贴剪贴板图片");
        return;
      }
      try {
        const items = await navigator.clipboard.read();
        const extractedFiles = [];
        for (const item of items) {
          const imgType = item.types.find((t) =>
            t === "image/png" || t === "image/jpeg" || t === "image/webp" || t === "image/svg+xml" || t === "application/pdf"
          );
          if (imgType) {
            const blob = await item.getType(imgType);
            extractedFiles.push(normalizeClipboardBlobToFile(blob));
            continue;
          }
          if (item.types.includes("text/plain")) {
            const textBlob = await item.getType("text/plain");
            const text = (await textBlob.text()).trim();
            if (text.startsWith("<svg") && text.includes("</svg>")) {
              const svgBlob = new Blob([text], { type: "image/svg+xml" });
              extractedFiles.push(normalizeClipboardBlobToFile(svgBlob));
            }
          }
        }
        if (!extractedFiles.length) {
          showToast("剪贴板中未检测到图片或 SVG（可截图后直接按 Ctrl+V 粘贴）");
          return;
        }
        flashDropzoneHighlight();
        await handleMediaFilesSelected(extractedFiles);
        showToast(\`📋 已从剪贴板粘贴 \${extractedFiles.length} 张图片到待转换队列\`);
      } catch {
        showToast("请允许浏览器读取剪贴板权限，或直接按键盘 Ctrl+V 粘贴截图");
      }
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    function convertWebpToPngBase64(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL("image/png");
          resolve({
            name: file.name.replace(/\\.webp$/i, ".png"),
            size: file.size,
            previewUrl: dataUrl,
            contentBase64: dataUrl.split(",")[1]
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("无法解码 WebP 图像"));
        };
        img.src = url;
      });
    }

    async function readSingleUploadFile(file) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".webp")) {
        return convertWebpToPngBase64(file);
      }
      const buf = await file.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buf);
      const isImage = /\\.(png|jpg|jpeg|svg)$/i.test(lower);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      return {
        name: file.name,
        size: file.size,
        previewUrl,
        contentBase64
      };
    }

    async function handleMediaFilesSelected(fileList) {
      const incoming = Array.from(fileList || []);
      if (!incoming.length) return;
      for (const file of incoming) {
        if (uploadedFilesQueue.length >= 20) {
          showToast("单次最多支持批量上传 20 个文件");
          break;
        }
        try {
          const item = await readSingleUploadFile(file);
          uploadedFilesQueue.push(item);
        } catch (err) {
          showToast("读取文件失败: " + err.message);
        }
      }
      renderUploadQueue();
    }

    function removeQueuedFile(idx) {
      uploadedFilesQueue.splice(idx, 1);
      renderUploadQueue();
    }

    function moveQueuedFile(idx, dir) {
      const target = idx + dir;
      if (target < 0 || target >= uploadedFilesQueue.length) return;
      const tmp = uploadedFilesQueue[idx];
      uploadedFilesQueue[idx] = uploadedFilesQueue[target];
      uploadedFilesQueue[target] = tmp;
      renderUploadQueue();
    }

    function clearUploadQueue() {
      uploadedFilesQueue = [];
      renderUploadQueue();
    }

    function renderUploadQueue() {
      const container = document.getElementById("upload-queue-container");
      const summaryEl = document.getElementById("upload-queue-summary");
      const startBtn = document.getElementById("btn-start-upload-job");
      startBtn.disabled = uploadedFilesQueue.length === 0;
      if (!uploadedFilesQueue.length) {
        container.innerHTML = "";
        if (summaryEl) summaryEl.style.display = "none";
        return;
      }
      const totalKb = (uploadedFilesQueue.reduce((acc, f) => acc + (f.size || 0), 0) / 1024).toFixed(1);
      if (summaryEl) {
        summaryEl.style.display = "flex";
        summaryEl.innerHTML = \`
          <span style="font-size:12.5px;color:#bfdbfe">📑 待转换队列：共 <strong>\${uploadedFilesQueue.length}</strong> 个文件（总计 \${totalKb} KB）· 多页图片将按顺序合成为同一个多页可编辑 <code>.pptx</code></span>
          <span style="font-size:11.5px;color:var(--text-muted)">点击卡片下方 ◀ / ▶ 可调整幻灯片页序</span>\`;
      }
      container.innerHTML = uploadedFilesQueue.map((item, idx) => {
        const ext = item.name.split(".").pop().toUpperCase();
        const thumbHtml = item.previewUrl
          ? \`<img src="\${item.previewUrl}" alt="\${item.name}" />\`
          : \`<span>📄 \${ext} 文档</span>\`;
        return \`
          <div class="upload-item">
            <div class="upload-thumb">\${thumbHtml}</div>
            <div class="upload-meta" title="\${item.name}"><strong>第 \${idx + 1} 页</strong> · \${item.name}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
              <span class="upload-size">\${(item.size / 1024).toFixed(1)} KB</span>
              <div class="btn-group" style="gap:4px">
                <button type="button" class="btn-mini" title="前移一页" \${idx === 0 ? "disabled" : ""} onclick="moveQueuedFile(\${idx}, -1)">◀</button>
                <button type="button" class="btn-mini" title="后移一页" \${idx === uploadedFilesQueue.length - 1 ? "disabled" : ""} onclick="moveQueuedFile(\${idx}, 1)">▶</button>
                <button type="button" class="btn-mini" onclick="removeQueuedFile(\${idx})">移除</button>
              </div>
            </div>
          </div>\`;
      }).join("");
    }

    function setStepState(stepNum, state) {
      const el = document.getElementById("job-step-" + stepNum);
      if (!el) return;
      el.classList.remove("active", "done");
      if (state) el.classList.add(state);
    }

    async function submitUploadConversionJob() {
      if (!uploadedFilesQueue.length) return;
      const btn = document.getElementById("btn-start-upload-job");
      btn.disabled = true;

      // Fast path: if all uploaded files are .svg, offer instant conversion AND worker conversion
      const allSvg = uploadedFilesQueue.every((f) => f.name.toLowerCase().endsWith(".svg"));
      const tracker = document.getElementById("upload-job-tracker");
      const artifactsBar = document.getElementById("job-artifacts-bar");
      const previewWrap = document.getElementById("job-preview-frame-wrap");
      const activeRetryBtn = document.getElementById("btn-retry-active-job");
      if (activeRetryBtn) activeRetryBtn.style.display = "none";
      tracker.style.display = "block";
      artifactsBar.style.display = "none";
      previewWrap.style.display = "none";

      setStepState(1, "active");
      setStepState(2, "");
      setStepState(3, "");
      setStepState(4, "");
      document.getElementById("job-title-label").textContent = "正在校验源文件并打包受控归档 (.tar.gz)...";

      if (allSvg) {
        try {
          const svgs = uploadedFilesQueue.map((f) => new TextDecoder().decode(Uint8Array.from(atob(f.contentBase64), (c) => c.charCodeAt(0))));
          setStepState(1, "done");
          setStepState(2, "done");
          setStepState(3, "active");
          const res = await fetch("/portal/api/svg-to-pptx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: uploadedFilesQueue[0].name.replace(/\\.svg$/i, "") + "_可编辑版.pptx",
              svgs
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || "SVG 转换失败");
          setStepState(3, "done");
          setStepState(4, "done");
          document.getElementById("job-title-label").textContent = "✅ SVG 矢量直转完成！已自动触发下载";
          downloadBase64File(data.pptxBase64, data.filename, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
          btn.disabled = false;
          return;
        } catch (err) {
          showToast("转换异常: " + err.message);
          btn.disabled = false;
          return;
        }
      }

      try {
        const res = await fetch("/portal/api/editable-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: uploadedFilesQueue.map((f) => ({
              name: f.name,
              contentBase64: f.contentBase64
            }))
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "创建转换任务失败");

        const job = data.job;
        activePreviewJobId = job.id;
        document.getElementById("job-id-badge").textContent = \`Job ID: \${job.id} (共 \${data.sourceSummary.pages} 页)\`;
        setStepState(1, "done");
        setStepState(2, "done");
        setStepState(3, "active");
        document.getElementById("job-title-label").textContent = "⏳ 已投递至 AI 视觉重建 Worker，正在执行 OCR / 分割 / 矢量化...";
        loadConversionHistory({ autoSelectLatest: false });

        if (activeJobPollTimer) clearInterval(activeJobPollTimer);
        activeJobPollTimer = setInterval(() => pollUploadJobStatus(job.id), 1500);
      } catch (err) {
        document.getElementById("job-title-label").textContent = "❌ 提交失败: " + err.message;
        showToast(err.message);
        btn.disabled = false;
      }
    }

    async function pollUploadJobStatus(jobId) {
      try {
        const res = await fetch(\`/portal/api/editable-jobs?id=\${encodeURIComponent(jobId)}\`);
        const data = await res.json();
        if (!res.ok || !data.ok) return;
        const job = data.job;

        if (job.status === "queued" || job.status === "running") {
          document.getElementById("job-title-label").textContent =
            job.status === "queued"
              ? "⏳ 任务排队中，等待 Worker 认领..."
              : "⚙️ Worker 正在执行高精度视觉重建与原生 OpenXML 合成...";
          return;
        }

        clearInterval(activeJobPollTimer);
        activeJobPollTimer = null;
        document.getElementById("btn-start-upload-job").disabled = false;

        const hasPptxArtifact = Array.isArray(job.artifacts) && job.artifacts.some((a) => a.name === "deck.pptx");
        const activeRetryBtn = document.getElementById("btn-retry-active-job");
        if (job.status === "succeeded" || hasPptxArtifact) {
          activePreviewJobId = job.id;
          if (activeRetryBtn) activeRetryBtn.style.display = "none";
          setStepState(3, "done");
          setStepState(4, "done");
          document.getElementById("job-title-label").textContent =
            job.status === "succeeded"
              ? "✅ 高保真可编辑 PPTX 重建成功！"
              : "✅ 可编辑 PPTX 已生成并可下载（含高保真背景保留层）";
          renderJobArtifacts(job);
          loadConversionHistory({ autoSelectLatest: false });
          showToast("转换完成！可立即下载可编辑 PPTX");
        } else {
          activePreviewJobId = job.id;
          const errMsg = job.error?.message || job.status;
          document.getElementById("job-title-label").textContent = "❌ 转换任务失败: " + errMsg;
          if (activeRetryBtn) {
            activeRetryBtn.disabled = false;
            activeRetryBtn.textContent = "🔄 重试该任务";
            activeRetryBtn.style.display = "inline-flex";
          }
          loadConversionHistory({ autoSelectLatest: false });
          showToast("转换失败: " + errMsg);
        }
      } catch {
        // Ignore transient poll errors
      }
    }

    let conversionHistoryJobs = [];
    let activePreviewJobId = null;
    let sourceCompareActive = false;
    let tallWorkbenchCanvas = false;
    let jobIrInspectorOpen = false;

    async function loadBenchmarkSampleJob(jobId, enableCompare = false) {
      if (!conversionHistoryJobs.length) {
        await loadConversionHistory({ autoSelectLatest: false });
      }
      const target = conversionHistoryJobs.find((j) => j && j.id === jobId) || conversionHistoryJobs[0];
      if (!target) {
        showToast("正在读取云端样板数据...");
        return;
      }
      openHistoryJobInWorkbench(target.id, { scroll: true });
      if (enableCompare && !sourceCompareActive) {
        toggleSourceComparison();
      }
    }

    async function toggleJobIrInspector(forceOpen) {
      jobIrInspectorOpen = typeof forceOpen === "boolean" ? forceOpen : !jobIrInspectorOpen;
      const drawer = document.getElementById("job-ir-inspector-drawer");
      const btn = document.getElementById("btn-toggle-ir-inspector");
      if (!drawer) return;
      if (!jobIrInspectorOpen) {
        drawer.style.display = "none";
        if (btn) btn.textContent = "🔍 检视透明图标与原生图元";
        return;
      }
      if (!activePreviewJobId && conversionHistoryJobs.length > 0) {
        openHistoryJobInWorkbench(conversionHistoryJobs[0].id, { scroll: true });
      }
      drawer.style.display = "block";
      if (btn) btn.textContent = "✕ 收起图元与抠图图标检视器";
      if (activePreviewJobId) {
        await renderJobIrInspector(activePreviewJobId);
      }
    }

    async function renderJobIrInspector(jobId) {
      const summaryEl = document.getElementById("job-ir-inspector-summary");
      const iconsGrid = document.getElementById("job-ir-icons-grid");
      const shapesList = document.getElementById("job-ir-shapes-list");
      const textsList = document.getElementById("job-ir-texts-list");
      if (!summaryEl || !iconsGrid || !shapesList || !textsList) return;
      summaryEl.textContent = "⏳ 正在拉取 deck.ir.json...";
      try {
        const res = await fetch(\`/portal/api/editable-artifact?id=\${encodeURIComponent(jobId)}&name=deck.ir.json&inline=1\`);
        const ir = await res.json();
        const page = (ir.pages && ir.pages[0]) || { images: [], shapes: [], textBoxes: [] };
        const images = Array.isArray(page.images) ? page.images : [];
        const shapes = Array.isArray(page.shapes) ? page.shapes : [];
        const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
        summaryEl.textContent = \`✓ 第 1 页共 \${images.length} 个独立透明抠图图标 · \${shapes.length} 个原生矢量形状/连线 · \${textBoxes.length} 个可编辑文本框 (0 背景大图)\`;

        const checkerBg = "repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 12px 12px";
        iconsGrid.innerHTML = images.length
          ? images.map((im) => {
              const src = im.previewDataUrl || im.assetPath || "";
              const b = im.box || {};
              return \`
                <div style="background:#0b1325;border:1px solid #243662;border-radius:6px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px">
                  <div style="width:48px;height:48px;border-radius:6px;background:\${checkerBg};display:flex;align-items:center;justify-content:center;padding:4px;border:1px solid #334155">
                    <img src="\${src}" alt="\${im.id}" style="max-width:100%;max-height:100%;object-fit:contain" />
                  </div>
                  <code style="font-size:10.5px;color:#c4b5fd">\${im.id}</code>
                  <span style="font-size:10px;color:#64748b">\${Math.round(b.w || 0)}×\${Math.round(b.h || 0)}pt</span>
                </div>\`;
            }).join("")
          : '<div style="color:var(--text-muted);font-size:12px">当前页无位图图标</div>';

        shapesList.innerHTML = shapes.map((s) => {
          const st = s.style || {};
          const fill = st.fill || "none";
          const stroke = st.stroke || "none";
          const dash = st.dash && st.dash !== "solid" ? " [虚线]" : "";
          const arrow = st.endArrow && st.endArrow !== "none" ? " →箭头" : "";
          const swatch = fill !== "none" ? fill : (stroke !== "none" ? stroke : "#475569");
          return \`
            <div class="el-row">
              <span style="display:inline-flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:\${swatch};border:1px solid #cbd5e1"></span>
                <strong>\${s.type}</strong> #\${s.id}\${dash}\${arrow}
              </span>
              <span style="color:#93c5fd">(\${Math.round(s.box?.x || 0)},\${Math.round(s.box?.y || 0)}) \${Math.round(s.box?.w || 0)}×\${Math.round(s.box?.h || 0)}</span>
            </div>\`;
        }).join("");

        textsList.innerHTML = textBoxes.map((t) => {
          const f = t.font || {};
          const color = f.color || "#111827";
          const snippet = String(t.text || "").replace(/\\s+/g, " ").slice(0, 24);
          return \`
            <div class="el-row">
              <span style="display:inline-flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:\${color};border:1px solid #cbd5e1"></span>
                <strong>#\${t.id}</strong> (\${f.sizePt || 14}pt)
              </span>
              <span style="color:#bfdbfe" title="\${String(t.text || '').replace(/"/g, '&quot;')}">"\${snippet}"</span>
            </div>\`;
        }).join("");
      } catch (err) {
        summaryEl.textContent = "读取 Deck IR 失败: " + err.message;
      }
    }

    function toggleWorkbenchCanvasHeight() {
      tallWorkbenchCanvas = !tallWorkbenchCanvas;
      const iframe = document.getElementById("job-preview-iframe");
      const btn = document.getElementById("btn-toggle-canvas-height");
      if (iframe) iframe.style.height = tallWorkbenchCanvas ? "860px" : "580px";
      if (btn) btn.textContent = tallWorkbenchCanvas ? "📏 恢复标准画布 (580px)" : "📏 展开大画布 (860px)";
    }

    function updateHeroLiveStats() {
      const valEl = document.getElementById("hero-live-stats-val");
      const subEl = document.getElementById("hero-live-stats-sub");
      if (!valEl || !subEl) return;
      const readyJobs = conversionHistoryJobs.filter((j) =>
        j && (j.status === "succeeded" || (Array.isArray(j.artifacts) && j.artifacts.some((a) => a.name === "deck.pptx")))
      );
      let totalShapes = 0;
      let totalTexts = 0;
      let totalIcons = 0;
      for (const j of readyJobs) {
        const m = j.quality?.metrics || {};
        totalShapes += Number(m["native-shapes"] || 0);
        totalTexts += Number(m["native-text-boxes"] || 0);
        totalIcons += Number(m["residual-images"] || 0);
      }
      valEl.textContent = \`已交付 \${readyJobs.length} 份文稿 · \${totalShapes} 个原生图元\`;
      subEl.textContent = \`累计生成 \${totalTexts} 个可编辑文本框 · \${totalIcons} 个透明抠图图标\`;
    }

    function toggleSourceComparison() {
      sourceCompareActive = !sourceCompareActive;
      const grid = document.getElementById("job-compare-grid");
      const sourcePane = document.getElementById("job-source-compare-pane");
      const btn = document.getElementById("btn-toggle-compare");
      if (!grid || !sourcePane || !btn) return;
      if (sourceCompareActive && activePreviewJobId) {
        sourcePane.style.display = "block";
        grid.style.gridTemplateColumns = "1fr 1.35fr";
        btn.textContent = "✕ 关闭原图同屏对比";
        const img = document.getElementById("job-source-compare-img");
        if (img) img.src = "/portal/api/editable-artifact?id=" + encodeURIComponent(activePreviewJobId) + "&name=source.png&inline=1";
      } else {
        sourcePane.style.display = "none";
        grid.style.gridTemplateColumns = "1fr";
        btn.textContent = "⚖️ 同屏对比原图与可编辑结果";
      }
    }

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "common-tools-portal-saved") {
        const hint = document.getElementById("job-save-sync-hint");
        if (hint) {
          hint.textContent = "✅ 已保存最新版本 (Revision: " + String(event.data.revision || "").slice(0, 8) + ") — 点击上方「下载可编辑 PPTX」即可获取更新后的文稿";
          hint.style.color = "#34d399";
        }
        showToast("✅ 工作台修改已保存并同步至 PPTX 与 Deck IR！");
      }
    });

    function formatHistoryTime(isoStr) {
      if (!isoStr) return "";
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return String(isoStr);
      const pad = (n) => String(n).padStart(2, "0");
      return \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())} \${pad(d.getHours())}:\${pad(d.getMinutes())}:\${pad(d.getSeconds())}\`;
    }

    function openHistoryJobInWorkbench(jobId, { scroll = true } = {}) {
      const job = conversionHistoryJobs.find((j) => j && j.id === jobId);
      if (!job) return;
      activePreviewJobId = job.id;
      const tracker = document.getElementById("upload-job-tracker");
      tracker.style.display = "block";
      const pageCount = job.quality?.metrics?.pages || job.quality?.metrics?.["slide-count"] || 1;
      document.getElementById("job-id-badge").textContent = \`Job ID: \${job.id} (共 \${pageCount} 页)\`;
      const hasPptxArtifact = Array.isArray(job.artifacts) && job.artifacts.some((a) => a.name === "deck.pptx");
      const activeRetryBtn = document.getElementById("btn-retry-active-job");
      if (job.status === "succeeded" || hasPptxArtifact) {
        if (activeRetryBtn) activeRetryBtn.style.display = "none";
        setStepState(1, "done");
        setStepState(2, "done");
        setStepState(3, "done");
        setStepState(4, "done");
        document.getElementById("job-title-label").textContent =
          job.status === "succeeded"
            ? "✅ 历史转换记录已恢复（可直接在线编辑预览或下载产物）"
            : "✅ 历史可编辑 PPTX 已恢复并可下载（含高保真背景保留层）";
        renderJobArtifacts(job);
      } else if (job.status === "queued" || job.status === "running") {
        if (activeRetryBtn) activeRetryBtn.style.display = "none";
        setStepState(1, "done");
        setStepState(2, "done");
        setStepState(3, "active");
        setStepState(4, "");
        document.getElementById("job-title-label").textContent = "⏳ 正在转换中...";
        if (activeJobPollTimer) clearInterval(activeJobPollTimer);
        activeJobPollTimer = setInterval(() => pollUploadJobStatus(job.id), 1500);
      } else {
        setStepState(1, "done");
        setStepState(2, "done");
        setStepState(3, "");
        setStepState(4, "");
        document.getElementById("job-artifacts-bar").style.display = "none";
        document.getElementById("job-preview-frame-wrap").style.display = "none";
        const errMsg = job.error?.message || job.status || "转换未完成";
        document.getElementById("job-title-label").textContent = "❌ 转换任务失败: " + errMsg;
        if (activeRetryBtn) {
          activeRetryBtn.disabled = false;
          activeRetryBtn.textContent = "🔄 重试该任务";
          activeRetryBtn.style.display = "inline-flex";
        }
      }
      renderConversionHistoryList();
      if (scroll) {
        tracker.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast(\`已加载任务 \${job.id.slice(0, 8)} 到工作台\`);
      }
    }

    function renderConversionHistoryList() {
      updateHeroLiveStats();
      const listEl = document.getElementById("upload-history-list");
      const badgeEl = document.getElementById("history-count-badge");
      if (!listEl) return;
      if (!conversionHistoryJobs.length) {
        if (badgeEl) badgeEl.textContent = "0 条记录";
        listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">暂无已转换的历史记录，请在上方上传或粘贴图片开始转换。</div>';
        return;
      }
      const searchVal = (document.getElementById("history-search-input")?.value || "").trim().toLowerCase();
      const statusFilter = document.getElementById("history-status-filter")?.value || "all";
      const filteredJobs = conversionHistoryJobs.filter((job) => {
        if (!job) return false;
        if (searchVal && !String(job.id || "").toLowerCase().includes(searchVal)) return false;
        const artifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
        const hasPptx = artifacts.some((a) => a.name === "deck.pptx");
        if (statusFilter === "ready") return job.status === "succeeded" || hasPptx;
        if (statusFilter === "running") return job.status === "running" || job.status === "queued";
        if (statusFilter === "failed") return !hasPptx && (job.status === "failed" || job.status === "cancelled" || job.status === "expired");
        return true;
      });
      if (badgeEl) badgeEl.textContent = \`共 \${conversionHistoryJobs.length} 条记录\${filteredJobs.length !== conversionHistoryJobs.length ? \` (筛选出 \${filteredJobs.length} 条)\` : ""}\`;
      if (!filteredJobs.length) {
        listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">没有符合当前筛选条件的历史记录。</div>';
        return;
      }
      listEl.innerHTML = filteredJobs.map((job, idx) => {
        const artifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
        const hasArtifact = (name) => artifacts.some((a) => a.name === name);
        const hasPptx = hasArtifact("deck.pptx");
        const hasPdf = hasArtifact("deck.pdf");
        const hasIr = hasArtifact("deck.ir.json");
        const hasPreview = hasArtifact("deck.preview.html");
        const isCurrent = activePreviewJobId === job.id;
        const shortId = String(job.id || "").slice(0, 8);
        const timeText = formatHistoryTime(job.createdAt || job.updatedAt);

        let statusPill = '<span class="status-pill status-off">未知状态</span>';
        if (job.status === "succeeded" || hasPptx) {
          statusPill = '<span class="status-pill status-on">✓ 已生成可编辑 PPTX</span>';
        } else if (job.status === "running" || job.status === "queued") {
          statusPill = '<span class="chip">⏳ 转换进行中</span>';
        } else {
          statusPill = '<span class="status-pill status-off">✕ 转换未完成</span>';
        }

        const m = job.quality?.metrics || {};
        const metricTags = [];
        if (m["large-raster-count"] === 0 && hasPptx) {
          metricTags.push('<span class="history-metric-tag" style="color:#6ee7b7;border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.14);font-weight:600">✨ 100% 纯原生无背景大图</span>');
        }
        const slidePages = m.pages ?? m["slide-count"];
        if (slidePages != null) metricTags.push(\`<span class="history-metric-tag">幻灯片: \${slidePages} 页</span>\`);
        if (m["native-shapes"] != null) metricTags.push(\`<span class="history-metric-tag">原生卡片/形状: \${m["native-shapes"]}</span>\`);
        if (m["native-text-boxes"] != null) metricTags.push(\`<span class="history-metric-tag">可编辑文本框: \${m["native-text-boxes"]}</span>\`);
        if (m["native-connectors"] != null) metricTags.push(\`<span class="history-metric-tag">正交连接线: \${m["native-connectors"]}</span>\`);
        if (m["residual-images"] != null && m["residual-images"] > 0) {
          metricTags.push(\`<span class="history-metric-tag" style="color:#c4b5fd;border-color:rgba(167,139,250,0.4)">透明抠图图标: \${m["residual-images"]}</span>\`);
        }
        if (!metricTags.length && artifacts.length) {
          metricTags.push(\`<span class="history-metric-tag">已交付产物: \${artifacts.length} 项</span>\`);
        }
        if (!hasPptx && job.error?.message) {
          const safeErr = String(job.error.message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          metricTags.push(\`<span class="history-metric-tag" style="color:#fca5a5;border-color:rgba(239,68,68,0.35);background:rgba(239,68,68,0.12)">失败原因: \${safeErr}</span>\`);
        }

        const actionBtns = [];
        if (hasPreview || hasPptx || job.status === "running" || job.status === "queued") {
          actionBtns.push(
            \`<button type="button" class="btn \${isCurrent ? 'primary' : ''}" onclick="openHistoryJobInWorkbench('\${job.id}', { scroll: true })">\${isCurrent ? '👁️ 当前正在预览' : '👁️ 在工作台打开预览'}</button>\`
          );
        }
        if (!hasPptx && (job.status === "failed" || job.status === "cancelled" || job.status === "expired")) {
          actionBtns.push(
            \`<button type="button" class="btn primary" onclick="retryConversionJob('\${job.id}', this)">🔄 重新转换</button>\`
          );
          actionBtns.push(
            \`<button type="button" class="btn" onclick="openHistoryJobInWorkbench('\${job.id}', { scroll: true })">查看详情</button>\`
          );
        }
        if (hasPptx) {
          actionBtns.push(\`<a class="btn-link success" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.pptx">📥 下载 PPTX</a>\`);
        }
        if (hasPdf) {
          actionBtns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.pdf">📄 下载 PDF</a>\`);
        }
        if (hasIr) {
          actionBtns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.ir.json">🧩 下载 IR</a>\`);
        }
        if (hasPreview) {
          actionBtns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.preview.html&inline=1" target="_blank">↗ 全屏预览</a>\`);
        }

        const thumbSrc = \`/portal/api/editable-artifact?id=\${encodeURIComponent(job.id)}&name=source.png&inline=1\`;

        return \`
          <div class="history-card \${isCurrent ? 'active-job' : ''}">
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:290px">
              <div class="history-thumb-box" title="点击在工作台中预览此文稿" onclick="openHistoryJobInWorkbench('\${job.id}', { scroll: true })">
                <img src="\${thumbSrc}" alt="原图缩略图" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\\'font-size:11px;color:#64748b\\'>原图预览</span>'" />
              </div>
              <div class="history-info">
                <div class="history-title-row">
                  <strong style="color:#eef2ff;font-size:13.5px">#\${idx + 1} · 任务 <code>\${shortId}</code></strong>
                  \${statusPill}
                  <span style="font-size:12px;color:var(--text-muted)">🕒 \${timeText}</span>
                  <span style="font-family:monospace;font-size:11px;color:#64748b">ID: \${job.id}</span>
                  <button type="button" class="btn-mini" style="padding:1px 6px;font-size:10.5px" onclick="copyText('\${job.id}', this)">复制 ID</button>
                </div>
                <div class="history-metrics">\${metricTags.join("")}</div>
              </div>
            </div>
            <div class="btn-group">\${actionBtns.join("")}</div>
          </div>\`;
      }).join("");
    }

    async function retryConversionJob(jobId, btnEl) {
      const targetId = jobId || activePreviewJobId;
      if (!targetId) return;
      const oldText = btnEl ? btnEl.textContent : "";
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = "⏳ 正在重新投递...";
      }
      try {
        const res = await fetch(\`/portal/api/editable-retry?id=\${encodeURIComponent(targetId)}\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetId })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "重试任务失败");

        const job = data.job;
        activePreviewJobId = job.id;
        const activeRetryBtn = document.getElementById("btn-retry-active-job");
        if (activeRetryBtn) {
          activeRetryBtn.disabled = false;
          activeRetryBtn.textContent = "🔄 重试该任务";
          activeRetryBtn.style.display = "none";
        }
        const tracker = document.getElementById("upload-job-tracker");
        const artifactsBar = document.getElementById("job-artifacts-bar");
        const previewWrap = document.getElementById("job-preview-frame-wrap");
        tracker.style.display = "block";
        artifactsBar.style.display = "none";
        previewWrap.style.display = "none";

        const pageCount = job.quality?.metrics?.pages || job.quality?.metrics?.["slide-count"] || 1;
        document.getElementById("job-id-badge").textContent = \`Job ID: \${job.id} (共 \${pageCount} 页)\`;
        setStepState(1, "done");
        setStepState(2, "done");
        setStepState(3, "active");
        setStepState(4, "");
        document.getElementById("job-title-label").textContent = "⏳ 已重新投递至 AI 视觉重建 Worker，正在执行转换...";

        await loadConversionHistory({ autoSelectLatest: false });
        tracker.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast(\`🔄 任务 \${job.id.slice(0, 8)} 已重新投递转换\`);

        if (activeJobPollTimer) clearInterval(activeJobPollTimer);
        activeJobPollTimer = setInterval(() => pollUploadJobStatus(job.id), 1500);
      } catch (err) {
        showToast("重试失败: " + err.message);
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = oldText || "🔄 重新转换";
        }
      }
    }

    async function loadConversionHistory({ autoSelectLatest = false } = {}) {
      try {
        const res = await fetch("/portal/api/editable-jobs?limit=20");
        const data = await res.json();
        if (!res.ok || !data.ok || !Array.isArray(data.jobs)) return;
        conversionHistoryJobs = data.jobs;
        if (autoSelectLatest && !activePreviewJobId && !activeJobPollTimer && conversionHistoryJobs.length > 0) {
          const firstReady = conversionHistoryJobs.find((j) =>
            j && (j.status === "succeeded" || (Array.isArray(j.artifacts) && j.artifacts.some((a) => a.name === "deck.pptx" || a.name === "deck.preview.html")))
          );
          if (firstReady) {
            openHistoryJobInWorkbench(firstReady.id, { scroll: false });
            return;
          }
        }
        renderConversionHistoryList();
      } catch {
        // Ignore history load failure when offline
      }
    }

    function renderJobArtifacts(job) {
      const bar = document.getElementById("job-artifacts-bar");
      const btnGroup = document.getElementById("job-download-buttons");
      const metricsStrip = document.getElementById("job-active-metrics-strip");
      bar.style.display = "block";

      const m = job.quality?.metrics || {};
      if (metricsStrip) {
        const tags = [];
        if (m["large-raster-count"] === 0) {
          tags.push('<span class="history-metric-tag" style="color:#6ee7b7;border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.14);font-weight:600">✨ 100% 纯原生图元 (0 整页背景残留)</span>');
        }
        if (m["native-shapes"] != null) tags.push(\`<span class="history-metric-tag">原生形状: \${m["native-shapes"]}</span>\`);
        if (m["native-text-boxes"] != null) tags.push(\`<span class="history-metric-tag">可编辑文本框: \${m["native-text-boxes"]}</span>\`);
        if (m["native-connectors"] != null) tags.push(\`<span class="history-metric-tag">正交连接线: \${m["native-connectors"]}</span>\`);
        if (m["residual-images"] != null && m["residual-images"] > 0) {
          tags.push(\`<span class="history-metric-tag" style="color:#c4b5fd">透明可移动图标: \${m["residual-images"]}</span>\`);
        }
        metricsStrip.innerHTML = tags.join("");
      }

      const artifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
      const hasArtifact = (name) => artifacts.some((a) => a.name === name);
      const btns = [];

      if (hasArtifact("deck.pptx")) {
        btns.push(\`<a class="btn-link success" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.pptx">📥 下载可编辑 PPTX (deck.pptx)</a>\`);
      }
      if (hasArtifact("deck.pdf")) {
        btns.push(\`<a class="btn-link primary" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.pdf">📄 下载 PDF (deck.pdf)</a>\`);
      }
      if (hasArtifact("deck.ir.json")) {
        btns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.ir.json">🧩 下载 Deck IR (deck.ir.json)</a>\`);
      }
      if (hasArtifact("conversion-report.json")) {
        btns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=conversion-report.json">📊 下载质量报告 (conversion-report.json)</a>\`);
      } else if (hasArtifact("deck.preservation-plan.json")) {
        btns.push(\`<a class="btn-link" href="/portal/api/editable-artifact?id=\${job.id}&name=deck.preservation-plan.json">📊 下载重建报告 (preservation-plan.json)</a>\`);
      }
      btnGroup.innerHTML = btns.join("");

      if (hasArtifact("deck.preview.html")) {
        const previewUrl = \`/portal/api/editable-artifact?id=\${job.id}&name=deck.preview.html&inline=1\`;
        document.getElementById("job-preview-frame-wrap").style.display = "flex";
        document.getElementById("job-preview-iframe").src = previewUrl;
        document.getElementById("job-open-preview-tab").href = previewUrl;
        if (sourceCompareActive) {
          const img = document.getElementById("job-source-compare-img");
          if (img) img.src = "/portal/api/editable-artifact?id=" + encodeURIComponent(job.id) + "&name=source.png&inline=1";
        }
        if (jobIrInspectorOpen) {
          renderJobIrInspector(job.id);
        }
      }
    }

    // --- SVG PRESETS FOR TAB 2 & TAB 3 ---
    const SVG_PRESETS = {
      arch: \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bgBlue" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#DCEBFF"/>
      <stop offset="100%" stop-color="#EAF4FF"/>
    </linearGradient>
    <linearGradient id="bgGreen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#DCF5E7"/>
      <stop offset="100%" stop-color="#EBFBF2"/>
    </linearGradient>
    <linearGradient id="bgPurple" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E8E5FF"/>
      <stop offset="100%" stop-color="#F2F0FF"/>
    </linearGradient>
    <linearGradient id="bgAmber" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFF0D6"/>
      <stop offset="100%" stop-color="#FFF7E8"/>
    </linearGradient>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#6873A8"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="960" height="540" fill="#FFFFFF"/>
  <g id="layer-entry">
    <rect x="24" y="18" width="760" height="106" rx="12" fill="url(#bgBlue)" stroke="#BDD8FF" stroke-width="1.5"/>
    <text x="48" y="56" font-size="20" font-weight="bold" fill="#18345E">业务入口层</text>
    <text x="48" y="84" font-size="13" fill="#4A628A">接收用户需求并返回结果</text>
    <rect x="235" y="32" width="160" height="78" rx="9" fill="#FFFFFF" stroke="#D8E8FF"/>
    <text x="315" y="77" font-size="15" font-weight="bold" text-anchor="middle" fill="#23406B">聊天界面</text>
    <rect x="415" y="32" width="160" height="78" rx="9" fill="#FFFFFF" stroke="#D8E8FF"/>
    <text x="495" y="77" font-size="15" font-weight="bold" text-anchor="middle" fill="#23406B">工作台</text>
    <rect x="595" y="32" width="160" height="78" rx="9" fill="#FFFFFF" stroke="#D8E8FF"/>
    <text x="675" y="77" font-size="15" font-weight="bold" text-anchor="middle" fill="#23406B">原业务系统</text>
  </g>
  <line x1="404" y1="124" x2="404" y2="148" stroke="#6873A8" stroke-width="2" marker-end="url(#arrow)"/>
  <g id="layer-gov">
    <rect x="24" y="150" width="760" height="106" rx="12" fill="url(#bgGreen)" stroke="#BCEAD0" stroke-width="1.5"/>
    <text x="48" y="188" font-size="20" font-weight="bold" fill="#1E5238">控制与治理层</text>
    <text x="48" y="216" font-size="13" fill="#46735B">管理用户、权限、配置与用量</text>
    <rect x="235" y="164" width="125" height="78" rx="9" fill="#FFFFFF" stroke="#D5F2E1"/>
    <text x="297" y="209" font-size="14" font-weight="bold" text-anchor="middle" fill="#255A3F">用户与权限</text>
    <rect x="372" y="164" width="125" height="78" rx="9" fill="#FFFFFF" stroke="#D5F2E1"/>
    <text x="434" y="209" font-size="14" font-weight="bold" text-anchor="middle" fill="#255A3F">Agent 配置</text>
    <rect x="509" y="164" width="125" height="78" rx="9" fill="#FFFFFF" stroke="#D5F2E1"/>
    <text x="571" y="209" font-size="14" font-weight="bold" text-anchor="middle" fill="#255A3F">版本管理</text>
    <rect x="646" y="164" width="115" height="78" rx="9" fill="#FFFFFF" stroke="#D5F2E1"/>
    <text x="703" y="209" font-size="14" font-weight="bold" text-anchor="middle" fill="#255A3F">用量监控</text>
  </g>
  <line x1="404" y1="256" x2="404" y2="280" stroke="#6873A8" stroke-width="2" marker-end="url(#arrow)"/>
  <g id="layer-runtime">
    <rect x="24" y="282" width="760" height="122" rx="12" fill="url(#bgPurple)" stroke="#D0C9FF" stroke-width="1.5"/>
    <text x="48" y="322" font-size="20" font-weight="bold" fill="#2B2358">Agent Runtime 层</text>
    <text x="48" y="350" font-size="13" fill="#554D80">运行内核，组织模型与工具循环</text>
    <rect x="235" y="294" width="122" height="50" rx="8" fill="#FFFFFF" stroke="#DCD6FF"/>
    <text x="296" y="324" font-size="14" font-weight="bold" text-anchor="middle" fill="#2B2358">任务准备</text>
    <rect x="372" y="294" width="122" height="50" rx="8" fill="#FFFFFF" stroke="#DCD6FF"/>
    <text x="433" y="324" font-size="14" font-weight="bold" text-anchor="middle" fill="#2B2358">模型判断</text>
    <rect x="509" y="294" width="122" height="50" rx="8" fill="#FFFFFF" stroke="#DCD6FF"/>
    <text x="570" y="324" font-size="14" font-weight="bold" text-anchor="middle" fill="#2B2358">工具执行</text>
    <rect x="646" y="294" width="115" height="50" rx="8" fill="#FFFFFF" stroke="#DCD6FF"/>
    <text x="703" y="324" font-size="14" font-weight="bold" text-anchor="middle" fill="#2B2358">结果反馈</text>
    <rect x="235" y="354" width="526" height="36" rx="7" fill="#FFFFFF" stroke="#DCD6FF"/>
    <text x="498" y="377" font-size="13" font-weight="bold" text-anchor="middle" fill="#3B3170">任务状态与上下文管理</text>
  </g>
  <g id="layer-model">
    <rect x="812" y="272" width="124" height="132" rx="12" fill="#FFE4EA" stroke="#F9B8C6" stroke-width="1.5"/>
    <text x="874" y="304" font-size="17" font-weight="bold" text-anchor="middle" fill="#6E1E32">模型接入</text>
    <rect x="826" y="318" width="96" height="72" rx="8" fill="#FFFFFF" stroke="#FAD1DA"/>
    <text x="874" y="360" font-size="13" font-weight="bold" text-anchor="middle" fill="#475569">大模型服务</text>
  </g>
  <line x1="784" y1="318" x2="812" y2="318" stroke="#6873A8" stroke-width="2" stroke-dasharray="5,4" marker-end="url(#arrow)"/>
  <line x1="404" y1="404" x2="404" y2="426" stroke="#6873A8" stroke-width="2" marker-end="url(#arrow)"/>
  <g id="layer-resource">
    <rect x="24" y="428" width="880" height="94" rx="12" fill="url(#bgAmber)" stroke="#F7D9A8" stroke-width="1.5"/>
    <text x="48" y="466" font-size="20" font-weight="bold" fill="#6B3D12">资源接入与执行层</text>
    <text x="48" y="494" font-size="13" fill="#85582A">接入业务资源，执行实际操作</text>
    <rect x="235" y="442" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#F5DFBA"/>
    <text x="285" y="480" font-size="13" font-weight="bold" text-anchor="middle" fill="#593A18">知识库</text>
    <rect x="345" y="442" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#F5DFBA"/>
    <text x="395" y="480" font-size="13" font-weight="bold" text-anchor="middle" fill="#593A18">业务数据</text>
    <rect x="455" y="442" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#F5DFBA"/>
    <text x="505" y="480" font-size="13" font-weight="bold" text-anchor="middle" fill="#593A18">业务系统</text>
    <rect x="575" y="442" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#F5DFBA"/>
    <text x="625" y="480" font-size="13" font-weight="bold" text-anchor="middle" fill="#593A18">内网服务器</text>
    <rect x="685" y="442" width="100" height="66" rx="8" fill="#FFFFFF" stroke="#F5DFBA"/>
    <text x="735" y="480" font-size="13" font-weight="bold" text-anchor="middle" fill="#593A18">安全沙箱</text>
  </g>
</svg>\`,
      flow: \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="960" height="540" fill="#0B1120"/>
  <text x="48" y="58" font-size="26" font-weight="bold" fill="#F8FAFC">云原生多活网关与智能路由拓扑 (SVG 贝塞尔曲线直转 Freeform)</text>
  <text x="48" y="88" font-size="14" fill="#94A3B8">所有弧线、圆角节点与文字均无损编译为 PowerPoint 原生可拖拽几何图形</text>
  <path d="M 190 270 C 290 140, 390 140, 480 210" fill="none" stroke="#38BDF8" stroke-width="3" stroke-dasharray="8,5"/>
  <path d="M 190 270 C 290 400, 390 400, 480 350" fill="none" stroke="#A78BFA" stroke-width="3" stroke-dasharray="8,5"/>
  <path d="M 620 210 C 700 210, 730 270, 790 270" fill="none" stroke="#34D399" stroke-width="3"/>
  <path d="M 620 350 C 700 350, 730 270, 790 270" fill="none" stroke="#34D399" stroke-width="3"/>
  <g id="node-ingress">
    <rect x="50" y="220" width="140" height="100" rx="16" fill="url(#cardGrad)" stroke="#38BDF8" stroke-width="2.5"/>
    <text x="120" y="265" font-size="17" font-weight="bold" text-anchor="middle" fill="#E0F2FE">统一接入网关</text>
    <text x="120" y="292" font-size="12" text-anchor="middle" fill="#7DD3FC">TLS 1.3 / OAuth2</text>
  </g>
  <g id="node-cluster-a">
    <rect x="440" y="160" width="180" height="96" rx="14" fill="url(#cardGrad)" stroke="#38BDF8" stroke-width="2"/>
    <text x="530" y="202" font-size="16" font-weight="bold" text-anchor="middle" fill="#F0F9FF">视觉与 OCR 集群</text>
    <text x="530" y="228" font-size="12" text-anchor="middle" fill="#93C5FD">PaddleOCR + SAM</text>
  </g>
  <g id="node-cluster-b">
    <rect x="440" y="302" width="180" height="96" rx="14" fill="url(#cardGrad)" stroke="#A78BFA" stroke-width="2"/>
    <text x="530" y="344" font-size="16" font-weight="bold" text-anchor="middle" fill="#F5F3FF">SVG 矢量编译引擎</text>
    <text x="530" y="370" font-size="12" text-anchor="middle" fill="#C4B5FD">Bezier + Group Tree</text>
  </g>
  <g id="node-output">
    <circle cx="845" cy="270" r="62" fill="#064E3B" stroke="#34D399" stroke-width="3"/>
    <text x="845" y="266" font-size="16" font-weight="bold" text-anchor="middle" fill="#D1FAE5">原生 PPTX</text>
    <text x="845" y="290" font-size="12" text-anchor="middle" fill="#6EE7B7">100% 可编辑</text>
  </g>
</svg>\`,
      kpi: \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="kpiBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EFF6FF"/>
      <stop offset="100%" stop-color="#DBEAFE"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="960" height="540" fill="#F8FAFC"/>
  <text x="48" y="56" font-size="26" font-weight="bold" fill="#0F172A">2026 研发效能与文档可编辑化核心指标看板</text>
  <g id="kpi-card-1">
    <rect x="48" y="88" width="272" height="132" rx="14" fill="url(#kpiBlue)" stroke="#BFDBFE" stroke-width="1.5"/>
    <text x="72" y="126" font-size="14" font-weight="bold" fill="#1E40AF">组件级原生可编辑率</text>
    <text x="72" y="182" font-size="40" font-weight="bold" fill="#1D4ED8">100%</text>
  </g>
  <g id="kpi-card-2">
    <rect x="344" y="88" width="272" height="132" rx="14" fill="#ECFDF5" stroke="#A7F3D0" stroke-width="1.5"/>
    <text x="368" y="126" font-size="14" font-weight="bold" fill="#065F46">单次批量转换上限</text>
    <text x="368" y="182" font-size="40" font-weight="bold" fill="#059669">20 页/批</text>
  </g>
  <g id="kpi-card-3">
    <rect x="640" y="88" width="272" height="132" rx="14" fill="#F5F3FF" stroke="#DDD6FE" stroke-width="1.5"/>
    <text x="664" y="126" font-size="14" font-weight="bold" fill="#5B21B6">支持输入源模态</text>
    <text x="664" y="182" font-size="32" font-weight="bold" fill="#6D28D9">IMG · PDF · SVG</text>
  </g>
  <g id="chart-panel">
    <rect x="48" y="246" width="864" height="252" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="76" y="286" font-size="18" font-weight="bold" fill="#1E293B">季度自动化建稿吞吐量趋势 (原生矢量柱状与折线复合图)</text>
    <line x1="90" y1="450" x2="860" y2="450" stroke="#CBD5E1" stroke-width="2"/>
    <rect x="140" y="380" width="76" height="70" rx="6" fill="#93C5FD"/>
    <text x="178" y="474" font-size="13" text-anchor="middle" fill="#475569">Q1</text>
    <rect x="320" y="345" width="76" height="105" rx="6" fill="#60A5FA"/>
    <text x="358" y="474" font-size="13" text-anchor="middle" fill="#475569">Q2</text>
    <rect x="500" y="310" width="76" height="140" rx="6" fill="#3B82F6"/>
    <text x="538" y="474" font-size="13" text-anchor="middle" fill="#475569">Q3</text>
    <rect x="680" y="275" width="76" height="175" rx="6" fill="#2563EB"/>
    <text x="718" y="474" font-size="13" text-anchor="middle" fill="#475569">Q4</text>
    <path d="M 178 370 L 358 335 L 538 298 L 718 262" fill="none" stroke="#10B981" stroke-width="3.5"/>
  </g>
</svg>\`,
      roadmap: \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <rect x="0" y="0" width="960" height="540" fill="#FFFFFF"/>
  <text x="48" y="58" font-size="26" font-weight="bold" fill="#0F172A">可编辑演示文稿引擎四阶段演进路线图</text>
  <line x1="72" y1="150" x2="888" y2="150" stroke="#3B82F6" stroke-width="4"/>
  <g id="phase-1">
    <circle cx="150" cy="150" r="16" fill="#2563EB" stroke="#DBEAFE" stroke-width="5"/>
    <rect x="60" y="190" width="185" height="280" rx="12" fill="#F8FAFC" stroke="#CBD5E1"/>
    <text x="152" y="228" font-size="16" font-weight="bold" text-anchor="middle" fill="#1E3A8A">Phase 1 · 位图重建</text>
    <text x="82" y="268" font-size="13" fill="#334155">• PaddleOCR 文本提取</text>
    <text x="82" y="300" font-size="13" fill="#334155">• SAM 语义容器分割</text>
    <text x="82" y="332" font-size="13" fill="#334155">• 原生文本框去重贴合</text>
  </g>
  <g id="phase-2">
    <circle cx="370" cy="150" r="16" fill="#059669" stroke="#D1FAE5" stroke-width="5"/>
    <rect x="280" y="190" width="185" height="280" rx="12" fill="#F0FDF4" stroke="#BBF7D0"/>
    <text x="372" y="228" font-size="16" font-weight="bold" text-anchor="middle" fill="#065F46">Phase 2 · 多页与PDF</text>
    <text x="302" y="268" font-size="13" fill="#1E293B">• 1-20 页批量保序归档</text>
    <text x="302" y="300" font-size="13" fill="#1E293B">• PDFium 2x 超分分页</text>
    <text x="302" y="332" font-size="13" fill="#1E293B">• 跨页统一主题字号</text>
  </g>
  <g id="phase-3">
    <circle cx="590" cy="150" r="16" fill="#7C3AED" stroke="#EDE9FE" stroke-width="5"/>
    <rect x="500" y="190" width="185" height="280" rx="12" fill="#F5F3FF" stroke="#DDD6FE"/>
    <text x="592" y="228" font-size="16" font-weight="bold" text-anchor="middle" fill="#5B21B6">Phase 3 · SVG 直转</text>
    <text x="522" y="268" font-size="13" fill="#1E293B">• 线性渐变与箭头解析</text>
    <text x="522" y="300" font-size="13" fill="#1E293B">• 圆弧转三次贝塞尔</text>
    <text x="522" y="332" font-size="13" fill="#1E293B">• 原生 &lt;p:grpSp&gt; 编组</text>
  </g>
  <g id="phase-4">
    <circle cx="810" cy="150" r="16" fill="#D97706" stroke="#FEF3C7" stroke-width="5"/>
    <rect x="720" y="190" width="185" height="280" rx="12" fill="#FFFBEB" stroke="#FDE68A"/>
    <text x="812" y="228" font-size="16" font-weight="bold" text-anchor="middle" fill="#92400E">Phase 4 · 融合建稿</text>
    <text x="742" y="268" font-size="13" fill="#1E293B">• 新建 PPT 舞台插槽</text>
    <text x="742" y="300" font-size="13" fill="#1E293B">• 浏览器直出 .pptx</text>
    <text x="742" y="332" font-size="13" fill="#1E293B">• 全宿主插件自动同步</text>
  </g>
</svg>\`
    };

    let svgSlides = [{ name: "第 1 页 · AI 架构图", svg: SVG_PRESETS.arch }];
    let currentSlideIdx = 0;
    let lastCompiledResult = null;
    let compileTimer = null;

    let fusionSlides = [
      {
        id: "slide-1",
        mode: "stage",
        title: "企业级 AI Agent 四层技术架构全景",
        summary: "通过统一网关层、治理层、Runtime 循环与资源执行层，实现安全可控的智能体落地",
        svg: SVG_PRESETS.arch
      },
      {
        id: "slide-2",
        mode: "stage",
        title: "云原生双活流量调度与矢量化管线",
        summary: "支持高并发视觉重建与 SVG 矢量直转双通道协同",
        svg: SVG_PRESETS.flow
      },
      {
        id: "slide-3",
        mode: "full-canvas",
        title: "",
        summary: "",
        svg: SVG_PRESETS.kpi
      }
    ];
    let currentFusionIdx = 0;

    function showToast(msg) {
      const el = document.getElementById("toast-msg");
      el.textContent = msg;
      el.style.display = "block";
      setTimeout(() => { el.style.display = "none"; }, 2200);
    }

    function copyText(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("已复制到剪贴板");
        if (btn) {
          const old = btn.textContent;
          btn.textContent = "✓ 已复制";
          setTimeout(() => { btn.textContent = old; }, 1400);
        }
      });
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
      document.getElementById(tabId).classList.add("active");
      btn.classList.add("active");
      if (tabId === "tab-svg-converter") {
        renderSlidePills();
        compileCurrentSvgDeck();
      } else if (tabId === "tab-ppt-fusion") {
        renderFusionPills();
        loadFusionSlideToForm();
        previewFusionDeck();
      } else if (tabId === "tab-pipeline-builder") {
        updateCommandBuilder();
      } else if (tabId === "tab-plugins-hub") {
        showClientConfig("claude");
      }
    }

    async function probeServices() {
      const latencyEl = document.getElementById("probe-latency-text");
      const badgeEl = document.getElementById("live-health-badge");
      latencyEl.textContent = "正在探测 /healthz 与 OAuth 元数据...";
      const t0 = performance.now();
      try {
        const [hRes, oRes] = await Promise.all([
          fetch("/healthz"),
          fetch("/.well-known/oauth-protected-resource/mcp")
        ]);
        const ms = Math.round(performance.now() - t0);
        const oauthJson = await oRes.json();
        const scopesCount = Array.isArray(oauthJson.scopes_supported) ? oauthJson.scopes_supported.length : 0;
        latencyEl.textContent = \`/healthz: \${hRes.status} OK (\${ms} ms) · 已激活 Scope: \${scopesCount} 个\`;
        badgeEl.textContent = \`● 服务健康 (\${ms}ms)\`;
        showToast(\`服务探测成功：响应耗时 \${ms} ms\`);
      } catch (err) {
        latencyEl.textContent = "探测异常: " + err.message;
      }
    }

    function renderSlidePills() {
      const container = document.getElementById("slide-pills-container");
      container.innerHTML = svgSlides.map((s, idx) =>
        \`<button type="button" class="page-pill \${idx === currentSlideIdx ? 'active' : ''}" onclick="selectSvgSlide(\${idx})">\${s.name || ('第 ' + (idx + 1) + ' 页')}</button>\`
      ).join("");
    }

    function selectSvgSlide(idx) {
      svgSlides[currentSlideIdx].svg = document.getElementById("svg-editor").value;
      currentSlideIdx = idx;
      document.getElementById("svg-editor").value = svgSlides[currentSlideIdx].svg;
      renderSlidePills();
      compileCurrentSvgDeck();
    }

    function loadSvgPreset(key) {
      svgSlides = [{ name: "第 1 页 · " + key.toUpperCase(), svg: SVG_PRESETS[key] || SVG_PRESETS.arch }];
      currentSlideIdx = 0;
      document.getElementById("svg-editor").value = svgSlides[0].svg;
      renderSlidePills();
      compileCurrentSvgDeck();
    }

    function loadMultiSlidePreset() {
      svgSlides = [
        { name: "第 1 页 · 架构全景", svg: SVG_PRESETS.arch },
        { name: "第 2 页 · 云原生拓扑", svg: SVG_PRESETS.flow },
        { name: "第 3 页 · 经营指标看板", svg: SVG_PRESETS.kpi }
      ];
      currentSlideIdx = 0;
      document.getElementById("svg-editor").value = svgSlides[0].svg;
      renderSlidePills();
      compileCurrentSvgDeck();
      showToast("已加载 3 页完整汇报套装，可直接导出多页 PPTX");
    }

    function addBlankSvgSlide() {
      svgSlides[currentSlideIdx].svg = document.getElementById("svg-editor").value;
      const newIdx = svgSlides.length + 1;
      svgSlides.push({ name: \`第 \${newIdx} 页\`, svg: SVG_PRESETS.kpi });
      currentSlideIdx = svgSlides.length - 1;
      document.getElementById("svg-editor").value = svgSlides[currentSlideIdx].svg;
      renderSlidePills();
      compileCurrentSvgDeck();
    }

    function removeCurrentSvgSlide() {
      if (svgSlides.length <= 1) {
        showToast("至少保留 1 页幻灯片");
        return;
      }
      svgSlides.splice(currentSlideIdx, 1);
      currentSlideIdx = Math.max(0, currentSlideIdx - 1);
      document.getElementById("svg-editor").value = svgSlides[currentSlideIdx].svg;
      renderSlidePills();
      compileCurrentSvgDeck();
    }

    function handleSvgFilesUpload(event) {
      const files = Array.from(event.target.files || []).slice(0, 20);
      if (!files.length) return;
      Promise.all(files.map((file, i) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: \`第 \${i + 1} 页 · \${file.name}\`, svg: String(reader.result || "") });
        reader.readAsText(file);
      }))).then((loaded) => {
        svgSlides = loaded;
        currentSlideIdx = 0;
        document.getElementById("svg-editor").value = svgSlides[0].svg;
        renderSlidePills();
        compileCurrentSvgDeck();
        showToast(\`成功导入 \${loaded.length} 个 SVG 文件\`);
      });
    }

    function scheduleServerCompile() {
      svgSlides[currentSlideIdx].svg = document.getElementById("svg-editor").value;
      if (compileTimer) clearTimeout(compileTimer);
      compileTimer = setTimeout(compileCurrentSvgDeck, 180);
    }

    async function compileCurrentSvgDeck() {
      const svgText = document.getElementById("svg-editor").value.trim();
      svgSlides[currentSlideIdx].svg = svgText;
      document.getElementById("svg-byte-count").textContent = svgText.length + " bytes";

      const preview = document.getElementById("svg-live-preview");
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");
      const svgEl = doc.querySelector("svg");
      if (!svgEl || doc.querySelector("parsererror")) {
        preview.innerHTML = "<span style='color:#ef4444;font-weight:600'>SVG 语法解析错误，请检查标签闭合</span>";
        return;
      }
      preview.innerHTML = "";
      preview.appendChild(svgEl.cloneNode(true));

      const statusEl = document.getElementById("compile-status-label");
      statusEl.textContent = "正在调用服务端 SVG → Deck IR 编译器...";

      try {
        const res = await fetch("/portal/api/svg-to-ir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ svgs: svgSlides.map((s) => s.svg) })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "编译失败");
        lastCompiledResult = data;
        const st = data.stats;
        statusEl.textContent = \`✓ 服务端编译完成（共 \${st.pageCount} 页，\${st.shapesCount} 个原生图形，\${st.textBoxesCount} 个文本框）\`;

        document.getElementById("live-ir-stats").innerHTML = [
          \`<span class="stat-badge">总页数: \${st.pageCount}</span>\`,
          \`<span class="stat-badge">原生形状: \${st.shapesCount}</span>\`,
          \`<span class="stat-badge">可编辑文本: \${st.textBoxesCount}</span>\`,
          \`<span class="stat-badge">原生编组(&lt;p:grpSp&gt;): \${st.groupsCount}</span>\`,
          \`<span class="stat-badge">渐变填充: \${st.gradientsCount}</span>\`,
          \`<span class="stat-badge">贝塞尔曲线: \${st.freeformsCount}</span>\`
        ].join("");

        const pageInfo = data.pages[currentSlideIdx] || data.pages[0];
        const elems = pageInfo ? pageInfo.elements : [];
        document.getElementById("element-count-label").textContent = \`当前页 \${elems.length} 个组件\`;
        document.getElementById("element-inspector-list").innerHTML = elems.map((el) => {
          const desc = el.category === "textBox"
            ? \`"\${el.text}" (\${el.fontSizePt}pt)\`
            : \`fill:\${el.fill}\`;
          const grp = el.groupId ? \` [组:\${el.groupId}]\` : "";
          return \`<div class="el-row"><span><strong>\${el.kind}</strong> #\${el.id}\${grp}</span><span style="color:#93c5fd">\${desc}</span></div>\`;
        }).join("");

        document.getElementById("real-ir-json").textContent = JSON.stringify(data.deckIr, null, 2);
      } catch (err) {
        statusEl.textContent = "编译异常: " + err.message;
      }
    }

    function downloadBase64File(base64, filename, mimeType) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function exportLivePptx() {
      const btn = document.getElementById("btn-export-pptx");
      const oldText = btn.textContent;
      btn.textContent = "⏳ 正在编译生成 .pptx...";
      try {
        svgSlides[currentSlideIdx].svg = document.getElementById("svg-editor").value;
        const res = await fetch("/portal/api/svg-to-pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: svgSlides.length > 1 ? "multi-slide-editable.pptx" : "svg-editable-slide.pptx",
            svgs: svgSlides.map((s) => s.svg)
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "生成 PPTX 失败");
        downloadBase64File(
          data.pptxBase64,
          data.filename,
          "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        );
        showToast(\`已生成并下载 \${data.filename} (\${Math.round(data.sizeBytes / 1024)} KB)\`);
      } catch (err) {
        showToast("导出失败: " + err.message);
      } finally {
        btn.textContent = oldText;
      }
    }

    function downloadCurrentSvg() {
      const blob = new Blob([document.getElementById("svg-editor").value], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = \`slide-\${currentSlideIdx + 1}.svg\`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function downloadCompiledIr() {
      if (!lastCompiledResult || !lastCompiledResult.deckIr) {
        showToast("请先等待编译完成");
        return;
      }
      const blob = new Blob([JSON.stringify(lastCompiledResult.deckIr, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deck.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("已导出真实 Deck IR (deck.json)");
    }

    function renderFusionPills() {
      const box = document.getElementById("fusion-pills");
      box.innerHTML = fusionSlides.map((s, idx) =>
        \`<button type="button" class="page-pill \${idx === currentFusionIdx ? 'active' : ''}" onclick="selectFusionSlide(\${idx})">第 \${idx + 1} 页 (\${s.mode === 'full-canvas' ? '整页SVG' : '混合舞台'})</button>\`
      ).join("");
    }

    function selectFusionSlide(idx) {
      currentFusionIdx = idx;
      renderFusionPills();
      loadFusionSlideToForm();
      previewFusionDeck();
    }

    function loadFusionSlideToForm() {
      const s = fusionSlides[currentFusionIdx];
      document.getElementById("fusion-mode").value = s.mode;
      document.getElementById("fusion-title").value = s.title || "";
      document.getElementById("fusion-summary").value = s.summary || "";
      document.getElementById("fusion-svg-editor").value = s.svg || "";
    }

    function updateFusionSlideField() {
      const s = fusionSlides[currentFusionIdx];
      s.mode = document.getElementById("fusion-mode").value;
      s.title = document.getElementById("fusion-title").value;
      s.summary = document.getElementById("fusion-summary").value;
      s.svg = document.getElementById("fusion-svg-editor").value;
      renderFusionPills();
      previewFusionDeck();
    }

    async function previewFusionDeck() {
      const theme = document.getElementById("fusion-theme").value;
      const slidesPayload = fusionSlides.map((s) => ({
        id: s.id,
        mode: s.mode,
        title: s.mode === "full-canvas" ? "" : s.title,
        summary: s.mode === "full-canvas" ? "" : s.summary,
        svg: s.svg
      }));

      try {
        const res = await fetch("/portal/api/svg-to-ir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme, slides: slidesPayload })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "融合编译失败");

        const st = data.stats;
        document.getElementById("fusion-stats").innerHTML = [
          \`<span class="stat-badge">总页数: \${st.pageCount}</span>\`,
          \`<span class="stat-badge">总形状: \${st.shapesCount}</span>\`,
          \`<span class="stat-badge">总文本框: \${st.textBoxesCount}</span>\`
        ].join("");

        const cur = fusionSlides[currentFusionIdx];
        const previewBox = document.getElementById("fusion-preview-box");
        if (cur.mode === "full-canvas") {
          previewBox.innerHTML = cur.svg;
        } else {
          previewBox.innerHTML = \`
            <div style="background:#fff;border-radius:8px;padding:14px;box-shadow:0 6px 20px rgba(0,0,0,0.12);color:#0f172a">
              <div style="width:36px;height:4px;background:#2563eb;margin-bottom:6px"></div>
              <div style="font-size:18px;font-weight:700;margin-bottom:4px">\${cur.title || '未命名标题'}</div>
              <div style="font-size:12px;color:#475569;margin-bottom:10px">\${cur.summary || ''}</div>
              <div style="border:1px dashed #cbd5e1;border-radius:6px;padding:6px;background:#f8fafc">\${cur.svg}</div>
            </div>\`;
        }
        document.getElementById("fusion-ir-json").textContent = JSON.stringify(data.deckIr, null, 2);
      } catch (err) {
        document.getElementById("fusion-status").textContent = "编译异常: " + err.message;
      }
    }

    async function exportFusionPptx() {
      const theme = document.getElementById("fusion-theme").value;
      const slidesPayload = fusionSlides.map((s) => ({
        id: s.id,
        mode: s.mode,
        title: s.mode === "full-canvas" ? "" : s.title,
        summary: s.mode === "full-canvas" ? "" : s.summary,
        svg: s.svg
      }));
      try {
        const res = await fetch("/portal/api/svg-to-pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: \`ppt-create-svg-fusion-\${theme}.pptx\`,
            theme,
            slides: slidesPayload
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "导出失败");
        downloadBase64File(
          data.pptxBase64,
          data.filename,
          "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        );
        showToast(\`成功导出融合演示文稿 \${data.filename}\`);
      } catch (err) {
        showToast("导出失败: " + err.message);
      }
    }

    function updateCommandBuilder() {
      const kind = document.getElementById("cmd-source-type").value;
      const inp = document.getElementById("cmd-input-path").value.trim() || "./input";
      const out = document.getElementById("cmd-output-path").value.trim() || "./output";

      let cliText = "";
      let mcpPayload = {};

      if (kind === "single-image") {
        cliText = \`# 1. 将单张图片打包为受控源归档 (.tar.gz)
node packages/cli/bin/common-tools-raw-image-archive.js --input "\${inp}" --output "./source-image.tar.gz"

# 2. 执行高保真可编辑 PPTX 转换
node packages/cli/bin/common-tools.js image-to-editable --input "./source-image.tar.gz" --output "\${out}"\`;
        mcpPayload = {
          step1_uploadTarget: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_team_upload_target", arguments: { capability: "image-to-editable", contentType: "application/gzip" } } },
          step2_createJob: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "image-to-editable", inputObjectKey: "owners/<owner>/inputs/<upload-id>.tar.gz", idempotencyKey: "img-single-001" } } }
        };
      } else if (kind === "batch-images") {
        cliText = \`# 将多张图片 (1-20 页) 按顺序打包并转换为同一个多页可编辑 PPTX
node -e '
const { createEditableSourceArchive } = require("./packages/slideclone-worker-adapter/team-raw-image-archive");
createEditableSourceArchive({
  inputFiles: ["./page-01.png", "./page-02.png", "./page-03.png"],
  outputFile: "./batch-pages.tar.gz"
});
'
node packages/cli/bin/common-tools.js image-to-editable --input "./batch-pages.tar.gz" --output "\${out}"\`;
        mcpPayload = {
          note: "多页图片按 inputFiles 顺序生成 assets/source-001.png .. source-020.png，合并输出至同一个 deck.pptx",
          createJob: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "image-to-editable", inputObjectKey: "owners/<owner>/inputs/batch-pages.tar.gz", idempotencyKey: "img-batch-001" } } }
        };
      } else if (kind === "pdf-doc") {
        cliText = \`# 1. 将图片型/扫描版 PDF 打包为可编辑源归档 (Worker 自动按页 2x 超分渲染)
node packages/cli/bin/common-tools-editable-source-archive.js --input "\${inp.replace(/\\.png$/i, '.pdf')}" --output "./pdf-source.tar.gz"

# 2. 执行多页 PDF -> 可编辑 PPTX 转换
node packages/cli/bin/common-tools.js image-to-editable --input "./pdf-source.tar.gz" --output "\${out}"\`;
        mcpPayload = {
          note: "PDF 归档在 Worker 端通过 PDFium 自动分页超分渲染并合成为多页可编辑 PPTX",
          createJob: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "image-to-editable", inputObjectKey: "owners/<owner>/inputs/pdf-source.tar.gz", idempotencyKey: "pdf-job-001" } } }
        };
      } else if (kind === "svg-file") {
        cliText = \`# 将单个或多个 .svg 文件直接编译打包为结构化 Deck IR 归档并生成原生 PPTX
node -e '
const { createEditableSourceArchive } = require("./packages/slideclone-worker-adapter/team-raw-image-archive");
createEditableSourceArchive({
  inputFiles: [require("path").resolve("\${inp.replace(/\\.png$/i, '.svg')}")],
  outputFile: require("path").resolve("./svg-deck.tar.gz")
});
'
node packages/cli/bin/common-tools.js image-to-editable --input "./svg-deck.tar.gz" --output "\${out}"\`;
        mcpPayload = {
          directPortalApi: "POST /portal/api/svg-to-pptx (直接返回原生 .pptx 二进制/Base64)",
          teamMcpJob: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "image-to-editable", inputObjectKey: "owners/<owner>/inputs/svg-deck.tar.gz", idempotencyKey: "svg-job-001" } } }
        };
      } else if (kind === "ppt-create") {
        cliText = \`# 基于 Presentation Spec JSON 新建多主题演示文稿
node packages/cli/bin/common-tools.js ppt-create --input "./presentation.json" --output "\${out}"\`;
        mcpPayload = {
          createJob: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "ppt-create", inputObjectKey: "owners/<owner>/inputs/presentation.json", idempotencyKey: "ppt-create-001" } } }
        };
      } else {
        cliText = \`# 存量 PPTX 质量审计与自动版式修复
node packages/cli/bin/common-tools.js ppt-improve --input "./legacy.pptx" --output "\${out}"\`;
        mcpPayload = {
          createJob: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "ppt-improve", inputObjectKey: "owners/<owner>/inputs/legacy.pptx", idempotencyKey: "ppt-improve-001" } } }
        };
      }

      document.getElementById("cli-cmd-preview").textContent = cliText;
      document.getElementById("mcp-rpc-preview").textContent = JSON.stringify(mcpPayload, null, 2);
    }

    function showClientConfig(mode) {
      const titleEl = document.getElementById("client-config-title");
      const codeEl = document.getElementById("client-config-code");
      if (mode === "claude") {
        titleEl.textContent = "Claude Code 插件市场与安装命令";
        codeEl.textContent = \`# 添加 Common Tools 插件市场并安装核心插件
/plugin marketplace add ./marketplaces/claude
/plugin install common-tools-image-to-editable
/plugin install common-tools-ppt-create
/plugin install common-tools-ppt-improve
/plugin install common-tools-ppt-quality\`;
      } else if (mode === "codex") {
        titleEl.textContent = "Codex CLI 插件安装与远程 MCP 绑定";
        codeEl.textContent = \`# 校验并同步本地/远程插件包
npm run common-tools:verify-plugins

# 生成指向当前网关的远程插件分发包
node scripts/generate-remote-plugin-bundles.js --origin https://plugins.iepose.cn --output ./dist-remote-plugins --capabilities image-to-editable,ppt-create,ppt-improve,ppt-quality,project-audit,siyuan-note\`;
      } else if (mode === "mcpjson") {
        titleEl.textContent = "标准 Streamable HTTP MCP 客户端配置 (Cursor / Antigravity / Windsurf / Claude Desktop)";
        codeEl.textContent = JSON.stringify({
          mcpServers: {
            "common-tools": {
              type: "streamable-http",
              url: MCP_ENDPOINT,
              oauth: {
                protectedResourceMetadataUrl: OAUTH_METADATA_URL
              }
            }
          }
        }, null, 2);
      } else if (mode === "httpcurl") {
        titleEl.textContent = "HTTP REST API 直连转换与产物下载示例 (cURL)";
        codeEl.textContent = \`# 1. 提交 Base64 图片执行云端纯原生 PPTX 转换
curl -X POST "\${window.location.origin}/portal/api/editable-jobs" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"files":[{"name":"slide-01.png","contentBase64":"<BASE64_IMAGE>"}]}'

# 2. 轮询任务状态并下载 100% 纯原生可编辑 PPTX
curl -s "\${window.location.origin}/portal/api/editable-jobs?id=<JOB_ID>"
curl -L -o editable-deck.pptx "\${window.location.origin}/portal/api/editable-artifact?id=<JOB_ID>&name=deck.pptx"\`;
      } else {
        titleEl.textContent = "远程插件 Bundle 生成与部署校验命令";
        codeEl.textContent = \`# 1. 校验能力契约与插件双端镜像一致性
npm run common-tools:verify-plugins

# 2. 运行 SVG 编译器与远程 MCP 全量测试
node --test test/svg-to-deck-ir.test.js test/common-tools-remote-mcp.test.js\`;
      }
    }

    let currentCapCategory = "all";

    function setCapabilityCategoryFilter(cat, btn) {
      currentCapCategory = cat || "all";
      document.querySelectorAll("#cap-category-pills .page-pill").forEach((b) => b.classList.remove("active"));
      if (btn) btn.classList.add("active");
      filterCapabilityCards();
    }

    function filterCapabilityCards() {
      const q = (document.getElementById("cap-search-input")?.value || "").trim().toLowerCase();
      document.querySelectorAll("#cap-cards-grid .cap-card").forEach((card) => {
        const cat = card.getAttribute("data-category") || "all";
        const text = card.getAttribute("data-search") || "";
        const matchCat = currentCapCategory === "all" || cat === currentCapCategory;
        const matchQ = !q || text.includes(q);
        card.style.display = matchCat && matchQ ? "flex" : "none";
      });
    }

    function quickLaunchCapability(tabId, cmdType) {
      const tabs = Array.from(document.querySelectorAll(".nav-tabs .nav-tab"));
      const tabIndexMap = {
        "tab-upload-converter": 0,
        "tab-svg-converter": 1,
        "tab-ppt-fusion": 2,
        "tab-pipeline-builder": 3,
        "tab-plugins-hub": 4
      };
      const idx = tabIndexMap[tabId] ?? 0;
      const btn = tabs[idx] || tabs[0];
      switchTab(tabId, btn);
      if (tabId === "tab-pipeline-builder" && cmdType) {
        const sel = document.getElementById("cmd-source-type");
        if (sel) {
          sel.value = cmdType;
          updateCommandBuilder();
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    renderSlidePills();
    document.getElementById("svg-editor").value = svgSlides[0].svg;
    loadConversionHistory({ autoSelectLatest: true });
  </script>
</body>
</html>`;
}

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
