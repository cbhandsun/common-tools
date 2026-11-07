"use strict";

const { renderPortalClientStudioScript } = require("./portal-client-studio");

function renderPortalClientScript(meta) {
  return `
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

${renderPortalClientStudioScript()}`;
}

module.exports = { renderPortalClientScript };
