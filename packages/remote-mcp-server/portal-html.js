"use strict";

const { renderPortalClientScript } = require("./portal-client");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createPortalHtmlRenderer({ portalMetadata }) {
  return function renderPortalHtml(config, environment = process.env) {
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
${renderPortalClientScript(meta)}
  </script>
</body>
</html>`;
}

}

module.exports = { createPortalHtmlRenderer, escapeHtml };
