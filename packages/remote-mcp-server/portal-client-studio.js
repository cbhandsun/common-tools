"use strict";

function renderPortalClientStudioScript() {
  return `
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
`;
}

module.exports = { renderPortalClientStudioScript };
