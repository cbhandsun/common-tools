# pd-hifi-slideclone

`pd-hifi-slideclone` 是图片/PDF/截图到可编辑 PPTX 的高保真还原流水线。它把 OCR、视觉结构识别、中间 JSON、PPTX 生成、截图比对、自动打磨和压缩交付拆成可替换 adapter，方便在不同环境里接 Azure AI Vision、Tesseract、PaddleOCR、ABBYY、Open XML SDK、LibreOffice 或 PowerPoint。

## 使用指令

| 指令 | 用途 |
| --- | --- |
| `node skills/pd-hifi-slideclone/scripts/slideclone.js init --input <输入目录> --out <任务目录>` | 创建任务配置 |
| `node skills/pd-hifi-slideclone/scripts/slideclone.js run --config <配置文件>` | 执行流水线 |
| `node skills/pd-hifi-slideclone/scripts/slideclone.js validate --ir <deck.json>` | 校验中间 JSON |
| `node skills/pd-hifi-slideclone/scripts/slideclone.js validate --ir <deck.json> --strict` | 把 warning 也作为失败，用于门禁 |
| `node skills/pd-hifi-slideclone/scripts/slideclone.js gate --summary <delivery-summary.json>` | 检查交付摘要并返回门禁结果 |
| `npm run slideclone:review -- --ir <deck.json>` | 在本机启动受限 IR Review Studio |
| `node skills/pd-hifi-slideclone/scripts/detect-regions.js --input <page.png> --out <目录>` | 识别并裁剪页面内应保真抠图的区域 |
| `@slideclone <图片/PDF目录> --out <任务目录>` | Codex 自然语言入口 |

## 自然语言指令

- 帮我把 `<图片版PPT/PDF/截图目录>` 高仿成可编辑 PPT。
- 帮我跑 `pd-hifi-slideclone`，输入是 `<目录>`，输出到 `<目录>`。
- 帮我只生成 PPT 高仿中间 JSON，先不导出 PPTX。
- 帮我对已有 `deck.json` 做结构校验和可编辑性检查。

## 目录结构

```text
skills/pd-hifi-slideclone/
  SKILL.md
  README.md
  schemas/
    deck-ir.schema.json
    slideclone.config.schema.json
  scripts/
      slideclone.js
    adapters/
      normalize-placeholder.js
      normalize-cli.js
      normalize-regions.js
      ocr-placeholder.js
      vision-placeholder.js
      pptx-openxml-placeholder.js
      render-placeholder.js
      render-libreoffice.js
      diff-placeholder.js
      diff-pixel-png.js
      compare-placeholder.js
      polish-placeholder.js
      compress-placeholder.js
```

## 任务产物

```text
runs/demo/
  slideclone.config.json
  normalized/
  ir/
    deck.json
  pptx/
  render/
  diff/
  compare/
  polish/
  compress/
  reports/
```

完整 CLI 示例配置见：

```text
skills/pd-hifi-slideclone/examples/full-cli.config.example.json
skills/pd-hifi-slideclone/examples/region-cli.config.example.json
skills/pd-hifi-slideclone/examples/pptx-image-com.config.example.json
```

## Adapter 契约

每个 adapter 都是一个 Node module，导出 async 函数：

```js
module.exports = async function adapter(input, context) {
  return { ok: true, data: {} };
};
```

推荐逐步替换默认 placeholder：

- `normalizeAdapter`：把 PDF、PPT/PPTX 或截图目录规范化成逐页图片。
- `ocrAdapter`：Azure AI Vision / Tesseract / PaddleOCR / ABBYY。
- `visionAdapter`：多模态模型，识别标题、正文、表格、卡片、图标、流程图、字体层级和配色。
- `pptxAdapter`：.NET Open XML SDK，输出真实可编辑 PPTX。
- `renderAdapter`：PowerPoint / LibreOffice，把 PPTX 导出为逐页图片。
- `diffAdapter`：像素 diff、布局 IoU、文本覆盖率。
- `compareAdapter`：按阈值生成通过/失败、逐页 findings 和打磨建议。
- `polishAdapter`：根据 findings 回写 IR，并重新生成 PPTX。
- `compressAdapter`：压缩最终 PPTX 的媒体资源，清理隐藏参考层。

## 自动识别应抠图区域

很多图片版 PPT 里会嵌入 UI 截图、操作手册页、图表截图、复杂流程图或图标组。它们如果强行全部矢量化，容易变形；如果整页贴图，又不可编辑。当前 skill 采用混合策略：

```text
原页截图 -> 自动候选区域 -> 裁片保真嵌入 -> OCR/视觉识别文本与形状 -> 可编辑对象覆盖
```

独立检测命令：

```bash
node skills/pd-hifi-slideclone/scripts/detect-regions.js \
  --input ./input/page-001.png \
  --out ./runs/region-test
```

流水线 adapter：

```json
{
  "adapters": {
    "normalize": "scripts/adapters/normalize-regions.js"
  },
  "regionProposal": {
    "includeFullPage": true,
    "emitRegionPages": false,
    "cropContainer": false,
    "minConfidence": 0.45,
    "minAreaRatio": 0.035,
    "maxAreaRatio": 0.72,
    "paddingPx": 4,
    "innerPaddingPx": 4,
    "innerHeaderSkipRatio": 0.18
  }
}
```

默认行为是在原页 IR 中生成 `images` 元素，例如 `embedded-ui-screenshot`、`embedded-document-screenshot`，并保留 `cropImage`、`evidenceBoxPx`、`confidence`、`strategy`、`reason`。生产级 vision adapter 应继续把裁片内的文字、卡片边框、表格线、按钮、图标识别为可编辑覆盖层。

当检测到浅灰卡片、操作步骤卡片等外层容器时，默认继续向容器内部查找真正应保真的界面截图或文档页，不直接裁整张卡片。外层卡片标题、钻石图标、底板、箭头等应由 OCR/视觉 adapter 还原成可编辑文本、形状和图标。若要调试外层容器边界，可设置 `regionProposal.cropContainer=true`。

候选规则优先选择：

- UI 产品界面、系统截图、网页截图。
- 操作手册或文档页中的大块页面截图。
- 复杂图表、流程图、线框图、图标组合。
- 低置信 OCR 或短期难以稳定对象化的纹理/照片/装饰区域。

## 生成后处理流程

`run` 默认在 PPTX 生成后执行：

```text
pptx -> optional font fit -> render -> diff -> compare -> polish loop -> compress -> delivery verify -> final report
```

配置项：

```json
{
  "maxIterations": 2,
  "fontFit": {
    "enabled": false,
    "candidates": ["Microsoft YaHei", "SimHei", "DengXian", "Arial"]
  },
  "textOcr": {
    "enabled": false,
    "adapter": "scripts/adapters/ocr-paddleocr-local.js",
    "mode": "anchored",
    "paddingPt": 16,
    "upscale": 1,
    "preprocess": false
  },
  "paddleOcr": {
    "lang": "ch",
    "ocrVersion": "PP-OCRv6",
    "cache": true
  },
  "postprocess": {
    "compare": true,
    "polish": true,
    "compress": true,
    "verifyCompressed": true,
    "stopWhenThresholdPassed": true
  }
}
```

输出报告：

- `reports/postprocess-result.json`：每轮渲染、diff、比对、打磨、压缩结果。
- `reports/pipeline-result.json`：最终产物汇总。
- `reports/delivery-summary.json`：交付验收摘要，包含最终状态、adapter、产物路径、硬指标、可编辑性、压缩和告警。
- `reports/delivery-summary.md`：面向人工 review 的交付摘要。
- `reports/font-fit-result.json`：字体候选渲染比对结果，启用 `fontFit.enabled` 时生成。
- `compare/text-coverage.iteration-*.json`：原图与生成渲染图 OCR 回读文本覆盖率，启用 `textOcr.enabled` 时生成。
- `reports/compression-report.json`：真实压缩 adapter 的媒体处理与体积报告。

IR 校验会在 `run` 中自动执行，并写入 `reports/ir-validation.json`。独立执行 `validate --ir` 时会检查：

- 页面与元素数组结构。
- 页面内元素 ID 是否重复。
- `box` 是否为有效数值，非 line 元素宽高是否为正。
- 每个元素是否有 `source` 和 `source.evidenceBox`。
- 图片元素是否能解析到真实资产文件。
- 不可编辑图片是否声明 `source.nonEditableReason`。
- `source.pageImage` 与页面源图是否存在，默认作为 warning；加 `--strict` 后 warning 也会让命令失败。

交付门禁可直接检查摘要：

```bash
node skills/pd-hifi-slideclone/scripts/slideclone.js gate \
  --summary ./runs/demo/reports/delivery-summary.json \
  --min-text-coverage 0.95 \
  --max-raster-image-area-ratio 0.25
```

`gate` 会检查 `status/passed`、所有 required checks、压缩交付 PPTX 文件存在、交付渲染已验证且渲染页数大于 0，并可按命令行额外阈值复核核心指标。失败时返回非 0，适合 CI 或自动流水线调用。

## 真实 PPTX 混合重建门禁

对图片版或低可编辑 PPTX，推荐先只跑单个样本，不要直接批量覆盖真实目录：

```bash
node skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js \
  --work-root "ppt文档/可编辑版本" \
  --out runs/native-rebuild-smoke \
  --only AI_Powered_Product_Workflow_Transformation \
  --smart-native-layers true
```

`--smart-native-layers true` 会开启稳定的智能分层组合：保留图标/截图/复杂纹理为局部裁片，同时把高置信卡片、连接线、表格网格、稳定主色价值横幅和可擦除的原生化图层拆成 Office 对象。它不会默认开启 `--objectify-layer-text true`，避免重新制造“图示底图上覆盖 OCR 文本框”的假编辑风险；如需追求更多内部文本可编辑性，可用 `npm run slideclone:rebuild-real-pptx-layered-text` 或在单页 A/B 中显式开启。高风险复杂图示会被 `preserve-fidelity-crop-until-subtype-rebuilder-is-confident` 安全门挡住，即使手动开启内部文本对象化，也不会把这些图示变成“底图 + 覆盖文字”的假编辑版。

重建后的严格质量门禁：

```bash
node skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js \
  --ir runs/native-rebuild-smoke/AI_Powered_Product_Workflow_Transformation.native.ir.json \
  --pptx runs/native-rebuild-smoke/AI_Powered_Product_Workflow_Transformation.native-editable.pptx \
  --out runs/quality-gate/AI_Powered_Product_Workflow_Transformation-strict \
  --fail-on-text-overlay-risk true \
  --fail-on-residual-layer-candidates true \
  --fail-on-duplicate-pptx-text true
```

`--fail-on-text-overlay-risk true` 会阻断“任何未清除文字的保真裁片上覆盖可编辑文本框”的假可编辑结果，包含只重叠标题或副标题的重影；`--fail-on-residual-layer-candidates true` 会阻断仍被分层器判为 `split-native-with-residual-crop` 的大块图示候选；`--fail-on-duplicate-pptx-text true` 会直接审计最终 PPTX 的 DrawingML 文本形状，阻断标题或说明文字被重复写入。准备交付或批量跑真实 PPT 时应一起启用。

质量门禁默认只向 stdout 输出有界的 `compact` 摘要，完整逐页证据仍写入 `quality-gate-report.json`。诊断时可显式使用 `--output-format full`（或 `--verbose true`）恢复完整 stdout JSON；无效格式会在读取 IR 或启动渲染器前失败关闭。重建契约、源页媒体排除和重建质量预算默认参与交付判定，预算阈值可通过 `--reconstruction-budget-policy`、`--max-reconstruction-residual-area-ratio`、`--max-reconstruction-largest-residual-area-ratio` 与 `--min-reconstruction-native-objects` 有界覆盖。

真实 PowerPoint 回归语料与版本趋势：

```bash
npm run slideclone:real-pptx-corpus-smoke
npm run slideclone:quality-trend-gate -- \
  --current runs/real-pptx-corpus/real-pptx-corpus.report.json \
  --history runs/quality-history/real-pptx.json \
  --snapshot-id build-123 \
  --record
```

`examples/real-pptx-corpus.manifest.json` 将系统图、表格、流程、截图、图表、循环图、网络和分层架构映射到现有 golden-set 案例，统一复用生成、渲染、可编辑性和视觉质量门禁。趋势门禁同时检查单版本退化与缓慢累计漂移，覆盖像素差异、前景缺失、可编辑对象比例和最大残留面积；失败快照默认不会污染历史基线，除非显式传入 `--record-failed`。

仓库还提供 `.github/workflows/ppt-office-regression.yml`，用于带 `slideclone-office` 标签、已安装 PowerPoint 与 LibreOffice 的隔离 Windows 自托管 Runner。配置仓库变量 `SLIDECLONE_REAL_PPTX_WORK_ROOT` 指向不入库的真实 `.work` 语料根目录后，工作流会按周或手动串行执行语料、恢复上一轮质量历史、运行趋势门禁，并只上传有界 JSON 报告；原始业务 PPTX 与页面图片不会作为 CI 工件上传。

批量报告矩阵可使用严格模式：

```bash
npm run slideclone:quality-matrix-real-pptx-strict -- \
  --report runs/quality-gate/AI_Powered_Product_Workflow_Transformation-strict/quality-gate-report.json
```

矩阵会汇总 `imageExpressionCounts`、`imageSubtypeCounts`、`imageRecommendationCounts`、`textOverlayRisk*` 和 `layerProfile`。`slideclone:quality-matrix-real-pptx-strict` 默认启用 `--require-no-text-overlay-risk true` 与 `--require-no-residual-layer-candidates true`，任何图上盖字风险或 residual split 候选都会让矩阵失败，适合作为小批量验证门禁。

打磨目标：

- 调整元素坐标、字号、行高、颜色、裁剪、层级。
- 按候选字体真实渲染并选择 diff 最低的字体，减少字宽、字重和抗锯齿差异。
- 对原图和生成渲染图做 OCR 回读，计算 `textCoverage`，抓漏字、错字和明显文本丢失；中文图片版 PPT 默认使用本地 PaddleOCR，Umi-OCR 的 PaddleOCR-json 和 Tesseract 作为显式回退。

Umi/PaddleOCR-json representative 批量 OCR 门禁示例：

```bash
npm run slideclone:quality-gate-ocr-batch-umi-representative -- \
  --input ppt文档/可编辑版本/native-smart-final \
  --out runs/quality-gate/final-six-deck-umi-ocr-representative \
  --ocr-cache-dir runs/ocr-cache/umi-representative \
  --reuse-render true \
  --quality-root runs/quality-gate \
  --fail-on-error true
```

- 对横幅、卡片、按钮和连线做安全颜色采样，采样异常时自动回退规则色。
- 基于 `source.evidenceBox` 计算 `layoutMeanIoU` 和 `maxCriticalOffsetPt`，专门拦截元素偏离识别证据。
- 把误识别为图片的文本恢复为可编辑文本框。
- 把可结构化的表格、图表、形状从截图替换为 Office 对象。
- 修复页边距、对齐、文本缺失和关键元素偏移。

压缩原则：

- 不牺牲可编辑性，不能把已编辑元素回退成整页截图。
- 只压缩非编辑型图片、去重媒体、删除临时参考层。
- 压缩报告必须记录压缩前后体积和处理过的资源。
- 默认把压缩后的 PPTX 作为交付文件，并再次用渲染 adapter 打开导出，避免压缩后出现打不开或空白页。

## 设计目标

- 尽量像原图：坐标、字号、颜色、层级和裁剪都进入校验闭环。
- 尽量可编辑：文本、形状、表格、图表优先生成 Office 对象。
- 可迭代打磨：比对未达标时自动回写 IR 并重新生成。
- 可控压缩：最终交付前压缩资源，但不破坏可编辑对象。
- 可交付验证：最终交付版必须能被 PowerPoint/LibreOffice 再次打开并渲染。
- 可验收摘要：每次 run 都输出 JSON/Markdown 交付摘要，方便自动化门禁和人工 review。
- 可追溯：每个元素保留 OCR/视觉证据和置信度。
- 可替换：所有外部服务通过 adapter 接入，不把密钥或账号写进仓库。

## 内置可运行 adapter

### Umi-OCR / PaddleOCR-json OCR

中文截图或图片版 PPT 建议优先使用本机 Umi-OCR 附带的 PaddleOCR-json，比 Tesseract 更适合中文排版回读。典型配置：

```json
{
  "textOcr": {
    "enabled": true,
    "adapter": "scripts/adapters/ocr-umi-paddle.js",
    "mode": "anchored",
    "paddingPt": 16,
    "upscale": 1,
    "preprocess": false
  },
  "umiOcr": {
    "paddleBin": "C:\\Program Files\\Umi-OCR_Paddle_v2.1.5\\UmiOCR-data\\plugins\\win7_x64_PaddleOCR-json\\PaddleOCR-json.exe",
    "initTimeoutMs": 60000
  }
}
```

`mode=anchored` 会按 IR 中每个文本框的 `source.evidenceBox` 分别裁剪原图和生成图，再做源图 OCR 与可编辑文本的逐框覆盖率比对，能避免整页 OCR 顺序错乱导致误判。对 Umi/PaddleOCR-json，当前样例推荐 `preprocess=false`、`upscale=1`、`paddingPt=16`，保留原始彩色裁片通常比二值化更稳定。

### 官方 PaddleOCR 3.x / PP-OCRv6

官方 provider 与 Umi 内置旧引擎并行存在，不会静默替换现有门禁。先安装隔离运行时：

```powershell
npm run slideclone:bootstrap-paddleocr
```

运行时安装到 `.tools/paddleocr-venv`，不会把 PaddlePaddle 导入 Node 主进程。首次推理可能按 PaddleOCR 的模型策略下载模型；离线或生产环境应预置模型目录并固定镜像/SBOM。配置示例：

```json
{
  "textOcr": {
    "enabled": true,
    "adapter": "scripts/adapters/ocr-paddleocr-local.js",
    "mode": "anchored",
    "paddingPt": 16,
    "upscale": 1,
    "preprocess": false
  },
  "paddleOcr": {
    "lang": "ch",
    "ocrVersion": "PP-OCRv6",
    "textDetectionModel": "PP-OCRv6_small_det",
    "textRecognitionModel": "PP-OCRv6_small_rec",
    "modelCacheDir": ".tools/paddleocr-models",
    "device": "cpu",
    "cpuThreads": 8,
    "useTextlineOrientation": true,
    "initTimeoutMs": 180000,
    "timeoutMs": 120000,
    "cache": true,
    "cacheDir": "runs/ocr-cache/paddleocr-local"
  }
}
```

适配器使用长驻、隔离的 JSON-lines worker，输出文本、置信度、四边形、方向、归一化文本框以及 PaddleOCR/PaddlePaddle 版本。外部结果会经过数量、文本、坐标、置信度和图像边界校验；请求支持超时和取消，错误不会包含 OCR 原文。缓存键包含图像 SHA-256、worker 内容和模型配置，切换模型不会误用旧结果。串行批量 OCR 门禁默认在 `127.0.0.1` 上创建带随机临时令牌的进程间 broker，使所有案例共享同一个模型 worker；请求以有界队列串行进入模型，批次结束会显式关闭。案例并发大于 1 时，`auto` 模式保留独立模型进程以维持吞吐；内存受限环境可传 `--paddle-ocr-broker true` 强制共享，诊断时可传 `false` 禁用。锚点文字门禁默认把同页裁剪按 8 张组成微批送入 worker，最多 16 张；单批失败会自动逐张隔离重试，不会让一个坏裁剪污染整页。可用 `textOcr.microBatch=false` 或 `--text-ocr-micro-batch false` 做对照诊断。

OpenXML 多 deck 构建会在同一 .NET 进程内按运行环境可见的 CPU 和内存自动选择 1、2 或 4 路并发；这套判断同时适用于宿主机和受 cgroup 限制的 Docker。需要固定资源上限时，可在配置的 `openXmlBuilder.batchConcurrency` 中设置 1–8。每个 deck 仍使用独立临时包、ZIP admission、最终 OpenXML SDK 校验和原子输出，返回顺序与输入顺序一致。

最终页缓存使用页面结构、源图及引用资产内容哈希、规则集和实现指纹生成可移植键，不再依赖工作区绝对路径。缓存资产带 SHA-256 清单，损坏或不完整的条目会拒绝恢复。

质量门禁还会按 IR、源图、渲染图、OCR 模型身份、阈值和实现内容缓存 diff、OCR 比对与联系表；命中后仍重新执行 PPTX 结构、编辑性、源媒体排除、重建契约与预算审计。OpenXML 最终 PPTX 构建也按相同原则内容寻址，命中时重新校验文件哈希、ZIP 边界和必需 PPTX 入口后才原子恢复。可通过 `openXmlBuilder.cache=false` 禁用，通过 `cacheDir` 和 `cacheMaxBytes` 指定目录与容量。查询、质量证据和 PPTX 缓存均只清理可识别的哈希条目，并按小时执行容量治理。

默认 provider 切换前使用同一 holdout 集分别跑了 Umi 和官方 PaddleOCR：

```powershell
npm run slideclone:quality-gate-real-pptx-paddleocr -- --ir <deck.json> --pptx <deck.pptx>
```

批量 holdout 可运行 `npm run slideclone:quality-gate-ocr-batch-paddleocr -- --input <corpus-dir> --fail-on-error true`。Windows 会自动使用已实测可用的 `paddle_dynamic`，避开 PaddlePaddle 3.3.1 静态 oneDNN 路径的当前限制；其他平台保留官方默认引擎选择。

2026-08-25 的 13 案例 holdout 在修正“失败 OCR 框被排除出覆盖率分母”的门禁偏差和路线图正文颜色回归后，PaddleOCR 达到 `13/13` 通过且逐例均高于 Umi：总匹配字符 `1728/1750`，Umi 为 `1661/1750`，OCR 调用失败框为 `0` 对 `2`。因此官方 PaddleOCR 已成为默认 provider；Umi 仍作为 Windows 兼容回退，Tesseract 仍作为轻量兜底。首次冷启动较慢，后续请求和重复门禁由内容缓存摊薄。

### Tesseract CLI OCR

先安装 Tesseract，并确认命令行可访问：

```bash
tesseract --version
```

然后把配置改成：

```json
{
  "adapters": {
    "normalize": "scripts/adapters/normalize-placeholder.js",
    "ocr": "scripts/adapters/ocr-tesseract-cli.js",
    "vision": "scripts/adapters/vision-placeholder.js",
    "pptx": "scripts/adapters/pptx-openxml-placeholder.js",
    "render": "scripts/adapters/render-placeholder.js",
    "diff": "scripts/adapters/diff-placeholder.js",
    "compare": "scripts/adapters/compare-placeholder.js",
    "polish": "scripts/adapters/polish-placeholder.js",
    "compress": "scripts/adapters/compress-placeholder.js"
  }
}
```

可选环境变量：

- `TESSERACT_BIN`：自定义 tesseract 可执行文件路径。
- `TESSERACT_LANG`：语言包，默认 `chi_sim+eng`。

当 Tesseract 对中文截图漏字或误字较多时，优先切换到默认的 `scripts/adapters/ocr-paddleocr-local.js`；无法安装官方运行时时，再显式使用 `scripts/adapters/ocr-umi-paddle.js`。

### .NET Open XML SDK PPTX

先安装 .NET SDK，然后执行：

```bash
dotnet restore skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj
```

把配置中的 `pptx` adapter 改成：

```json
"pptx": "scripts/adapters/pptx-openxml-dotnet.js"
```

该 adapter 会调用 .NET builder，把 `ir/deck.json` 转成 `pptx/deck.pptx`。当前实现覆盖可编辑文本框、基础形状、图片、简单表格、connector、阴影、图片裁剪、自由曲线，以及带内嵌 XLSX 工作簿的真实 Office `ChartPart`。柱/条、折线、饼图和圆环图会绑定 `nativePayload.fallbackSignature` 与 SHA-256；图表数据、类型或样式改变但 payload 未刷新时，Node 适配器和 C# builder 都会失败关闭，不会悄悄输出数据与外观脱节的图表。

生成器会在写出 PPTX 后立即运行 Open XML SDK validator；校验失败会中止并输出无效节点路径，避免生成 PowerPoint 无法打开的文件。

### 重建证据与源图排除门禁

流水线会为页面和每个 IR 元素补充 `reconstruction` 契约，并输出 `reports/reconstruction-inventory.json`。契约记录源页 SHA-256、像素画布、内容族、实现方式、边界状态、来源充分度、z-order 角色和注册图层组。每轮自动打磨写回的 IR 都会重新补充并校验契约，最终 inventory 始终对应实际交付的 IR，而不是初始识别版本。无法可靠重建的对象必须是 `manual_required` 并说明原因；生产交付默认因此失败，只有诊断调用可显式允许。

真实 PPTX 质量门禁还会检查包内媒体：源页原图的精确 SHA-256 命中，以及 PNG 重编码后的感知哈希近似命中，都会触发 `source-media-exclusion`。重建契约与源页媒体排除在该门禁中默认开启；只有诊断运行可分别显式传入 `--fail-on-reconstruction-contract false` 或 `--fail-on-source-media false`。确有必要保留源页媒体时，页面必须同时声明 `reconstruction.allowCanonicalMedia=true` 和非空原因。

### Review Studio

```bash
npm run slideclone:review -- --ir ./runs/demo/ir/deck.json --port 4317
```

服务只监听 `127.0.0.1`。页面可叠加源图与 IR 图层，拖动元素，编辑几何、文字、字体、填充/描边和审阅备注。浏览器不能修改 `assetPath`、`source` 或重建证据；写入请求有 CSP、CSRF token、请求体上限和字段白名单。应用补丁前会做整份 IR 校验，写入前创建 `.review-backups/` 备份，并把不含文字内容的哈希审计记录追加到 `review-audit.jsonl`。

### 受限 SVG source graphic

IR 中的 `shapes` 或 `icons` 可以使用 `type: "source_graphic"` 和同目录 `.svg` 资产。OpenXML adapter 会在构建前把安全子集转换为原生矩形、圆角矩形、椭圆、折线和 DrawingML 自由曲线，不会把 SVG 作为图片嵌入 PPTX。当前只接受 `viewBox`、自闭合 `path/rect/circle/ellipse/polygon/polyline/line`、`#RRGGBB`/`none` 颜色，以及 `M/L/H/V/C/Q/Z` 路径命令；DOCTYPE、实体、脚本、外链、CSS、transform、嵌套元素、arc 命令和越界坐标全部拒绝。

### python-pptx 兼容兜底

如果目标环境的 PowerPoint 对手写 Open XML 包仍然敏感，可以使用更完整的 Office 模板兜底：

```json
"pptx": "scripts/adapters/pptx-python-pptx.js"
```

该 adapter 使用 `python-pptx` 生成标准 PPTX 骨架，并保留文本框、基础形状、图片和简单表格的可编辑性。

### 流程图规则视觉 adapter

在没有真实多模态视觉服务时，可用内置规则 adapter 对典型流程图做可编辑对象化验证：

```json
"vision": "scripts/adapters/vision-flow-diagram-rules.js"
```

当前覆盖：

- 页面标题、横幅、卡片标题、按钮文字等可编辑文本框。
- 圆角矩形、菱形占位图标、PowerPoint 原生 straight/elbow connector + arrowhead、简单引擎图标。
- 外层卡片对象化，内部 UI/文档页继续使用 `normalize-regions` 的精准裁片。
- 对宝石、相机、魔棒等复杂小图标可自动生成透明局部裁片，避免简化形状造成明显 diff；周围卡片、文字和连线仍保持可编辑。
- 卡片、按钮、横幅可写入 Office 原生 `style.shadow`，由 PPTX 生成器输出 DrawingML `outerShdw`，减少阴影边缘 diff。

该 adapter 主要用于验证端到端工程链路和 IR/PPTX/render/diff 闭环，不替代生产级多模态视觉 adapter。

### 真实 PPTX 混合重建策略

对真实业务 PPT，默认采用“原生可编辑 + 局部保真裁片”的混合策略，而不是强行把所有图示、图表、截图都拆成可编辑对象：

- 文本、简单形状、可靠 connector 优先输出为 Office 原生可编辑对象。
- 复杂图示、截图、图表和设计感强的组合区域，在没有足够结构把握时保留为局部 `fidelity-crop`，避免退化成“看起来可编辑但完全变形”的对象。
- 禁止用整页大图冒充可编辑版本；只有明确标记为装饰背景的封面 underlay 可以作为全页背景存在。
- 每个非编辑局部裁片都必须记录 `source.detector`、`source.strategy=local-fidelity-crop`、`source.nonEditableReason`，让质量报告能解释“为什么这里不是原生对象”。
- `rebuild-real-pptx-native.js` 会在 IR 的 `meta.rebuildStrategy` 和 `native-rebuild-report.json` 中记录策略、detector 统计和对象组成，便于批量比较不同策略。
- 每个保真裁片会额外记录 `source.layer`，包括 `layerType`、`nativeConfidence`、`editBenefit`、`recommendedAction` 和 `reconstructionPlan`。其中 `diagram-zone`、`table-zone`、`chart-zone` 会被标出可原生化 primitive，例如 `container-shapes`、`native-connectors`、`table-grid`、`series-marks`；`screenshot-zone` 和装饰图层默认继续保真裁片。
- 质量报告会输出 `layerProfile`，核心指标包括 `largestUnexplainedCropAreaRatio`、`nativeCandidates`、`residualCandidates`、`layerTypeCounts` 和 `recommendedActionCounts`，用于追踪“大块图片是否逐步被解释成结构”。
- 如果要优先提升可编辑率，可在真实 PPTX 重建时开启 `--objectify-layer-text true`。该模式会对高置信 `diagram-zone`/`table-zone` 把内部 OCR 文本恢复为原生文本框，并把原裁片改成去文字 residual crop。它会显著增加可编辑文本，但可能略增视觉 diff，因此建议作为 A/B 候选使用，不作为默认保真模式。
- 在 `--objectify-layer-text true` 基础上，可继续开启 `--objectify-layer-containers true`。该模式会对可重建图示/表格区域里高置信彩色卡片、节点和文本容器生成原生 `roundRect`，并把结果写入 `source.objectifiedContainers`；纯白正文、截图和低置信插画不会被强行套框。
- 在 `--objectify-layer-containers true` 基础上，可继续开启 `--objectify-layer-connectors true`。该模式只在已识别原生容器之间、且间隙采样确认存在连线墨迹时生成 PowerPoint 原生 straight connector + arrowhead，并把结果写入 `source.objectifiedConnectors`；不会把全页噪声线段直接输出。
- 常见关系线通过 `connector-component-library` 解析为有界的语义角色和原生样式。固定闭环使用带原生线端箭头的 Office `arc`，不再把箭头拆成独立三角形；有明确起止节点的流程线会写入 `source.semanticConnector` 并在交付前检查端点、方向和水平/垂直轴漂移。兼容生成器需要修复弧线线端时，只能通过 `arc-line-end-ooxml` 创建一个新的 PPTX，禁止覆盖源文件。
- `--objectify-layer-connectors true` 还会识别一类“中心徽章 + 环形蓝/绿节点 + 放射连线”的网络图示：外围节点会输出为 `network-diagram-native-node` 原生矩形，放射线输出为 `network-diagram-native-ray` 原生线条；复杂中心徽章只保留为 `network-center-residual-crop` 局部裁片，避免把图标强行矢量化后变形。
- `--objectify-layer-connectors true` 还会在高置信 3 列层级/树状图上输出原生 `hierarchy-diagram-native-card`、`hierarchy-diagram-native-divider`、`hierarchy-diagram-native-connector`、`hierarchy-diagram-native-root` 和 `hierarchy-diagram-native-root-dot`。这类图示会移除原大裁片，避免“底图 + 覆盖文字框”的假编辑版；截图、复杂插画和图标库无法可靠匹配的内容仍走局部裁片。
- `--objectify-layer-connectors true` 也会识别高置信“三角关系/铁三角拓扑”图示，把三角边、循环箭头和中心节点输出为 `triangle-topology-native-edge`、`triangle-topology-native-arrow`、`triangle-topology-native-center`，同时把宝石图标、旋转标签、底部注释等当前不稳定的内容切成 node/label 级 `triangle-topology-residual-crop` 小裁片。这样可避免一张大图覆盖整个关系图，同时保留图标和旋转文字的视觉保真。
- `--objectify-layer-connectors true` 还会识别封面页“引擎核心”图示，把蓝色核心盾/盘、绿色纵轴和三张标签卡片输出为 `cover-engine-core-native-shield`、`cover-engine-core-native-inner`、`cover-engine-core-native-axis`、`cover-engine-core-native-card`。该路径会移除原大裁片，优先获得真实可编辑结构；盾牌内部切面纹理当前用简化原生形状近似，后续可继续补渐变/多边形细节。
- `--objectify-layer-connectors true` 还会识别“Skills Engine + 四段技能链路”的总览工作流：需求理解、原型/高仿、PRD生成、智能评审等阶段块会用原生矩形主体 + 右指三角头拟合成箭头块，路由线也会输出为 `skill-chain-overview-native-*` 原生组件；左侧资料云、中间引擎核心和右侧文档示意继续拆成 `skill-chain-overview-residual-crop` 小裁片。该路径避免把整条总览工作流留成宽幅图片，同时不强行矢量化碎片云和截图示意。
- `--objectify-layer-connectors true` 还会识别“输入截图/Brief -> 生成节点 -> PRD 文档卡”的生成流程图：右侧文档卡、标题条、分割线、中心节点和连接线会输出为 `prd-generation-flow-native-*` 原生组件；左侧 UI/Brief 截图示意继续拆成 `prd-generation-flow-residual-crop` 小裁片。这样避免把 screenshot-like 内容硬矢量化，同时消除右侧文档卡的大块图片残留。
- `--objectify-layer-connectors true` 还会识别“原型截图/魔棒/网页截图”的可视化验证流程：蓝色实线、橙色虚线箭头和说明胶囊会输出为 `prototype-validation-flow-native-*` 原生组件；LiveWebpage 卡片、魔棒图标和网页截图保留为 `prototype-validation-flow-residual-crop` 小裁片。该路径优先解释关系表达，同时避免把截图和图标强行拆成低保真原生图形。
- 对同一类原型验证页里的“意图转界面”等截图示意局部裁片，即使它没有进入整条流程图 detector，也会被归类为 `prototype-validation-flow-residual-crop`，避免在报告里继续显示成未知 `foreground-graphic-crop`。
- `--objectify-layer-connectors true` 还会识别“需求素材汇聚 -> 放大镜分析 -> 结构化输出”的需求理解流程：右侧输出卡片、侧边标签和分支连接线会输出为 `demand-understanding-flow-native-*` 原生组件；左侧会议纪要/旧版说明/业务截图/飞书对话等资料卡会按 OCR 锚点拆成多个 `demand-understanding-flow-residual-crop` 小裁片，中间放大镜/漏斗也单独保真。该路径优先把可编辑的结构化输出和关系线还原成 Office 对象，同时把 screenshot-like 输入素材从大块图片降为可单独移动的小裁片。
- `--objectify-layer-connectors true` 还会识别“PRD -> scanner engine -> Approved Asset / Risk ProblemPool”的智能评审闸门：审批/风险卡片、内层面板、状态图标和路由线会输出为 `review-risk-gate-flow-native-*` 原生组件；左侧 PRD 截图和中间 scanner 宝石/纹理继续拆成 `review-risk-gate-flow-residual-crop` 小裁片。该路径体现“表达结构原生化、图标图示保真裁片”的原则，避免把风险卡片留成大块图片。
- 在 `--objectify-layer-containers true` / `--objectify-layer-connectors true` 基础上，可继续开启 `--erase-objectified-layer-primitives true`。该模式会把已恢复为原生对象的容器和 connector 从 residual crop 中擦除，写入 `source.primitiveErased`、`source.erasedPrimitiveCount`，让局部裁片逐步只承载剩余复杂图标/纹理。
- `--objectify-value-banners true` 会对 `value-banner` 裁片做主色采样：低方差纯色或主色覆盖率足够高的横幅会替换成 `value-banner-native-background` 原生矩形；多色复杂横幅、渐变/文字占比过高的横幅继续保留局部裁片，避免为追求可编辑率牺牲视觉相似度。`--smart-native-layers true` 默认包含该安全路径。
- 在 `--erase-objectified-layer-primitives true` 基础上，可继续开启 `--split-erased-residual-crops true`。该模式只对已擦除且仍很大的 `diagram-zone` / 已原生化的 `table-zone` residual crop 做二次前景组件分析；会把彩色图示和浅灰/低饱和面板都纳入候选，只有未覆盖浅灰结构很低时才用多个小 `fidelity-crop` 替换原大图，并写入 `source.residualSplit`、`source.parentImageId` 和 `source.originalCropBox`。被安全门拒绝的图层会记录 `source.residualSplitRejected` 诊断原因，便于继续打磨真实样例。
- 对 residual split 后的小尺寸、近方形、高饱和或中性状态、且非满矩形组件，会进一步标注为 `icon-residual-crop`。这类宝石/状态/装饰图标默认保留为可移动局部裁片，除非未来有高置信 SVG/图标库匹配，避免为了“可编辑”把图标重画变形。
- 对横向流程/截图/图标混合图示，如果普通组件分析被长连线粘成一块，`--split-erased-residual-crops true` 会继续尝试宽幅 band 切分：优先按面状视觉密度拆成 `split-wide-residual-crop` 局部裁片，同时把连接线像素包含进相邻 band；如果整条光束/管线仍把画面连成一个连续区域，则退回为三段连续宽幅 band，避免一张大 underlay 横跨整页。
- `--objectify-table-grid true` 也会识别四象限价值页中的一横一竖长分割线，把它们写成 `table-zone-native-quadrant-divider` 原生线条；随后 residual 擦除/拆分会把剩余宝石、徽章等复杂图标保留为小局部裁片，避免整页 table/diagram underlay 覆盖在可编辑文本下。
- 在 `--objectify-layer-text true` 基础上，可继续开启 `--objectify-table-grid true`。该模式只对内部文本呈现稠密矩阵的 `table-zone` 生成原生可编辑网格线，并把结果写入 `source.objectifiedGrid`；稀疏流程图、截图和插画不会被强行画成表格。

### OfficePLUS / iSlide applied components

`npm run slideclone:harvest-active-ppt-component -- --provider islide --label cycle-loop` 用于采集已经由 iSlide / OfficePLUS 插件直接应用到当前 PowerPoint 页面的组件。采集器默认只复制当前活动 slide 到新的 PPTX，再写入 `runs/plugin-component-inventory/<provider>-applied-components`；这样可以把插件插入的真实 DrawingML 组件变成可学习模板，同时避免把整份业务 deck 的其他页面污染进组件库。

iSlide 组件库目前优先走“登录插件内点击应用到当前 PPT 页 -> 采集当前活动页”的路径，不假设存在可稳定调用的后台下载接口。默认 `plugin-component-inventory` 只读取内容寻址资产库和仓库内的已采集目录，不访问插件安装目录；只有显式执行 `npm run slideclone:plugin-component-inventory-acquire` 或传入 `--include-provider-roots` 时，才会扫描 `%APPDATA%\iSlide`、`%LOCALAPPDATA%\iSlide`、OfficePLUS 等外部来源。

学习或采集完成后，`component-library-refresh` 会把已应用、已下载或已通过自保真门禁的组件自动物化到 `runs/plugin-component-inventory/assets/sha256/<hash>.<ext>`，并写入不含原绝对路径的 `asset-registry.json`。也可以对已有清单手动迁移：

```powershell
npm run slideclone:component-library-materialize -- `
  --inventory runs/plugin-component-inventory/inventory.json
```

后续默认生成只读取该离线库；iSlide、OfficePLUS 仅在显式采集模式下使用。仅供视觉参考、尚未采用的素材默认不会复制；确有许可并需要保留时，显式添加 `--include-reference-assets`。

OfficePLUS 的“图表”分类还可能下载 `.crtx` 原生 Office 图表模板，而不是 PPTX。采集器会把它标记为 `chart-template`，只读取图表类型、系列/数据点数量、图例/标签及主题样式入口，绝不写入图表数据文本；目前可直接识别饼图为 `pie-share-chart`，让份额图优先保持为可编辑原生图表。

只有明确需要学习整份模板包时才加 `--full-deck`。默认活动页模式会返回 `saveScope: "active-slide-only"` 和原始 `slideIndex`，后续 registry 会把这些 PPTX 识别为 `applied-component`，并优先作为 `inspect-openxml-applied-plugin-component` 参与本地组件匹配和原生重放。

下载或采集到的组件先通过批量自保真门禁，再进入可复用资产候选。该门禁会按内容哈希去重，以最多 4 路并行执行 DrawingML 学习、原生重放、整页及局部区域渲染对比，并只把通过阈值的组件写入 `promotedAssets`：

```powershell
npm run slideclone:component-self-fidelity-batch -- --root runs/plugin-component-inventory/islide-applied-components --out runs/component-self-fidelity-islide --concurrency 2
```

完整链路为：组件搜索或插件内应用 -> 活动页/下载目录捕获 -> DrawingML 结构学习 -> 批量自保真验收 -> 合格资产晋级 -> 重建阶段语义匹配与原生重放。搜索命中不等于直接采用，未通过自保真门禁的组件不会进入晋级清单。

对需要批量学习 iSlide / OfficePLUS 组件的场景，使用隔离采集会话，而不要把业务 PPT 当作采集源。它会创建一个空白、可丢弃的 PPTX；将组件应用到这份稿并原位保存后，采集器只接受该会话目录内的文件，先写入 staging，再按原生形状数量、可复用组和图片主导风险过滤。通过结构门禁的资产会保存到 `runs/plugin-component-inventory/isolated-collection/verified/<provider>`，该目录已被默认组件 registry 扫描：

```powershell
npm run slideclone:component-isolated-collection -- --init --provider islide
```

随后在 PowerPoint 打开生成的 `collection-fixture.pptx`，通过插件应用一个组件并保存，再执行生成的 guide 中的 `--ingest` 命令。结构通过不等同于视觉重放通过；仍需对 verified 目录运行 `component-self-fidelity-batch`，只有通过自保真门禁后才应进行广泛替换或正式晋级。

高频组件可以一次生成 20 项采集波次（iSlide 与 OfficePLUS 各 10 项）。每项会得到独立的空白 PPTX、插件搜索词、目标图式和带 `--verify-fidelity` 的回收命令，可避免一次应用多个组件后无法归因：

```powershell
npm run slideclone:component-learning-wave -- --init
```

当真实 A/B 或最小单元审计暴露出原波次未覆盖的图式时，不要重新执行 `--init`。使用 `--extend` 会保留已采集和已晋级任务，只追加拓扑三角、整组闭环流程、分支卡片流程等缺口组件：

```powershell
npm run slideclone:component-learning-wave -- --extend `
  --out runs/plugin-component-inventory/isolated-collection
```

可用 `--provider islide` 或 `--provider officeplus` 缩小追加范围。每个任务仍是单独的空白 PPTX，应用后按生成的 `ingestCommand` 回收；通过自保真前不会进入正式组件库。

### Promoted component A/B gate

Use learned plugin components only after their isolated replay has passed self-fidelity. The A/B gate rebuilds only the named golden decks twice, then blocks a candidate if visual fidelity, editability, or residual-layer metrics regress. It never runs a full batch unless you explicitly name every deck.

```powershell
npm run slideclone:component-adoption-ab-gate -- `
  --deck PM_Portal_AI_Asset_Hub `
  --deck-pages PM_Portal_AI_Asset_Hub=3,9 `
  --deck Digital_Product_Brain `
  --deck-pages Digital_Product_Brain=2 `
  --component-self-fidelity-report runs/plugin-component-inventory/isolated-collection/self-fidelity/islide/component-self-fidelity-batch.report.json `
  --component-self-fidelity-report runs/plugin-component-inventory/isolated-collection/self-fidelity/officeplus/component-self-fidelity-batch.report.json
```

Use `--deck-pages Deck_Name=1,3-4` to make the gate assess only the structurally relevant pages; repeat it for each selected deck. The candidate automatically derives the provider-specific verified component roots from the self-fidelity reports, so it does not scan all installed plugin files. It requires at least one actual `componentTemplateAppliedShapes` result by default (`--min-adopted-native-shapes 0` is available only for visual-only diagnostics). A visually safe run with zero native component adoption is reported as `failed-no-adoption`, not as a promotion success.

真实缺口应先生成“采集/复用/保留裁片”计划，再打开插件。该命令会综合最小单元审计、组件学习状态、自保真报告和已有页级 A/B 报告：已被证伪的资产不会再次晋级；截图、图标和图示类的局部视觉资产会保留为可移动裁片；只有结构匹配且能落地原生形状的目标才进入组件采集队列。

```powershell
npm run slideclone:component-gap-learning-plan -- `
  --adoption-report runs/component-adoption-gap-card-grid-v1/component-adoption-ab-gate.json `
  --adoption-report runs/component-adoption-gap-radial-v1/component-adoption-ab-gate.json `
  --out runs/plugin-component-inventory/isolated-collection/gap-learning-plan.json
```

For a single promoted-only rebuild, pass `--component-assets-promoted-only` together with one or more `--component-self-fidelity-report` paths. The command rejects missing promotion evidence instead of silently falling back to unverified plugin assets.

输出的 `learning-wave.json` 是机器可读队列，`learning-wave.md` 是逐项应用指引。首轮覆盖圆弧/折线箭头、线性流程、关系图、层级、路线图、卡片矩阵、层叠/漏斗、四象限、表格和饼图等高频表达；复杂图标、插画和截图不在该队列中，仍按最小局部裁片策略处理。

自保真验收会先在 OpenXML 层隔离被选中的顶层组件组，隐藏母版图形并移除同页标题、占位符和其他组件，再渲染源组件。这一步不启动 PowerPoint，也不会加载插件，避免采集页中的叠放对象被误判为重放缺失。允许“原生形状与可编辑文本为主体、少量图标图片为独立对象”的混合组件；图片占主导的文件仍不会被当作原生组件晋级。

并行组件重建会由父进程只执行一次组件采集与清单解析，写入带 SHA-256 名称的只读快照，再把显式快照传给所有 deck/page worker；worker 不再重复扫描 iSlide、OfficePLUS 或采集目录。候选查询在单次任务内使用 Promise 去重并默认 3 路有界并发，跨任务缓存键绑定 provider、端点、查询参数和搜索实现指纹，避免旧适配器结果误命中。

组件回写默认也使用跨平台 OpenXML 引擎，因此学习完成后，生产或 Docker 运行时不依赖 iSlide、OfficePLUS、PowerPoint 或 Aspose。宿主模式和 Docker 模式调用同一份 `OpenXmlDeckBuilder` 源码、校验器和契约测试；Windows 宿主仅额外提供可选的 PowerPoint COM 对照验证，不形成生产能力分叉。`npm run slideclone:component-replacement-apply` 会复制已采集 PPTX 中通过门禁的原生形状、文本、自由曲线、连接线、分组、自包含原生表格、带单一内嵌非宏 XLSX 工作簿的原生图表、有界 SmartArt 和图片关系，重映射 drawing ID / relationship ID，并按目标框缩放；表格缩放时会同步调整列宽与行高，图表会完整复制 `ChartPart`、工作簿数据，以及各最多一个的自包含 `ChartStylePart`、`ChartColorStylePart`、`ThemeOverridePart` 和 `ChartDrawingPart`。图表用户形状支持有界的可编辑文本/矢量批注及 PNG 图片：绘图 XML 限 8 MiB 和 256 个锚点，最多 32 张 PNG、单张 16 MiB、合计 64 MiB，像素尺寸也必须通过门禁；嵌套图表、宏、文本链接、外链、孤立图片关系和未知子部件均拒绝。SmartArt 作为 `DiagramDataPart`、`DiagramLayoutDefinitionPart`、`DiagramStylePart`、`DiagramColorsPart` 和 `DiagramPersistLayoutPart` 五部件闭包复制，四个框架关系与 Data 内部绘图缓存关系会同步确定化重映射；Data/缓存各限 16 MiB，其余定义各限 8 MiB，全部禁止 DTD、外链和未知子关系。图片型 SmartArt 支持 Data、Layout 与 Persisted Drawing 中有界的共享 PNG/JPEG：最多 16 张唯一图片、单张 16 MiB、合计 64 MiB，并校验格式、像素尺寸、所有引用及孤立关系；同一媒体被多个 SmartArt 部件引用时仍只写入一个 `ImagePart`。第三方扩展和其他图片格式仍失败关闭。图表样式与主题覆盖部件限 4 MiB、禁止 DTD、外链和任何子关系，并保持原始 XML 字节；写回完成后必须通过 Open XML SDK 校验。复用同一样本时，SHA-256 每个唯一样本只计算一次，报告的 `performance` 会给出耗时、样本数和哈希计算次数。使用主题色、主题字体、主题表格样式、原生图表或 SmartArt 的组件仅允许写入主题签名相同的目标，否则失败关闭，避免颜色或字体静默变化；图表自己的安全主题覆盖可以随图表迁移。带外部数据、宏、OLE、ActiveX、连接文件、未知工作簿 Part、未知图表子 Part 或多个样式/主题覆盖/用户形状部件的图表，以及带未知扩展或不安全媒体的 SmartArt、音视频、外链和组件局部动画不会被静默降级，而是明确拒绝。只有离线 Windows 诊断或对照验证才使用 `npm run slideclone:component-replacement-apply-powerpoint`。

所有作为目标、模板或学习样本进入 .NET OpenXML 边界的 PPTX，都会在 SDK 打开前执行 OPC/ZIP admission：限制压缩包大小、条目数、单条目和总展开体积、异常压缩比、重复名称、非便携路径与必需入口。生成器使用同目录临时文件完成构建、内容类型修复和二次校验，全部通过后才原子替换目标，失败不会破坏既有输出。幻灯片级 `p:timing` 会按 `spTgt@spid` 与所选组件 shape ID 关联；命中的动画明确返回 `animated_component_not_portable`，无法归属的时间线返回 `animation_target_unresolved`，不再静默丢动画。操作报告同时提供稳定 `reasonCode`、逐操作 `elapsedMs`、所需显式字体，以及入包数量和展开字节指标。

Windows 质量机可运行 `npm run slideclone:powerpoint-editable-roundtrip -- --file <deck.pptx> --mode auto`。该门禁只编辑 ASCII 临时目录中的副本，支持 `shape-text`、`smartart-text` 与 `geometry`；它会保存、关闭、重新打开并验证修改确实存活。SmartArt 通过节点关联的 ShapeRange 修改文本，以避开部分 PowerPoint 版本直接写 `SmartArtNode.TextFrame2` 返回 `E_FAIL` 的兼容问题。Docker 与宿主仍执行同一 OpenXML 生成器；Docker 负责结构、渲染和包内容验证，Windows 定时门禁额外提供 PowerPoint 实体编辑证明。

SmartArt 专项集合可运行 `npm run slideclone:smartart-portability-holdout -- --manifest <holdout.json> --out <evidence-dir>`。manifest 默认门槛为至少 10 个案例，并要求覆盖 list、process、hierarchy、relationship、matrix、pyramid、picture 七个族；每例同时核验五部件闭包、图片要求、宿主/Docker 展开内容 SHA-256 一致，以及可选但默认开启的 PowerPoint SmartArt 文本编辑回写。当前仓库不把本机或授权来源的真实组件 PPTX 提交为测试夹具，质量机应从受控组件资产库物化 manifest；合成契约测试仍只用于边界回归，不能冒充真实 holdout 覆盖。

该策略吸收了几类同类项目的经验：`ppt-master` 的原生 DrawingML 与快照兜底分层、HTML slide 工具的视觉预览/评分闭环，以及图片生成工作流的可复现批处理记录。最终目标是高保真可编辑交付，而不是追求“所有像素都原生化”的虚假指标。

连接线 IR 约定：

```json
{
  "type": "line",
  "style": {
    "connectorType": "elbow",
    "endArrow": "triangle"
  }
}
```

生成器会把它写成 PowerPoint 原生 connector，不用三角形贴片拼箭头。

中文字体会写入 PPTX run 的 Latin/East Asian/Complex Script typeface，避免 Office 默认字体替换造成字宽和抗锯齿差异。

### 流程图规则打磨 adapter

可启用确定性打磨 adapter，让未达标时自动回写 IR 并重新生成 PPTX：

```json
"polish": "scripts/adapters/polish-flow-diagram-rules.js"
```

当前会根据 `foregroundMissingRatio` 等失败指标调整：

- 圆角矩形 `radiusRatio`。
- 原生 connector 线宽。
- 文本字号与少量文本框偏移。

所有变更会写入 `reports/postprocess-result.json` 的 `polish.changes`，包含 `elementId`、`before`、`after` 和 `reason`。

### PPTX 媒体压缩 adapter

生产交付前可使用真实压缩 adapter：

```json
"compress": "scripts/adapters/compress-pptx-media.js"
```

它会重写 PPTX zip 包内 `ppt/media/*` 的 PNG/JPEG 图片，保留 slide XML、文本框、形状、表格和原生 connector，不把可编辑对象回退成截图。默认策略较保守：

```json
{
  "compress": {
    "jpegQuality": 88,
    "pngCompressLevel": 9,
    "maxImagePixels": 0,
    "minSavingBytes": 128
  },
  "postprocess": {
    "verifyCompressed": true
  }
}
```

`maxImagePixels=0` 表示不降采样，只做 PNG/JPEG 优化；需要压更小文件时可显式设置像素上限。`verifyCompressed=true` 时，压缩后的 PPTX 会被再次打开并导出到 `render/iteration-compressed-final`。输出：

- `compress/deck.compressed.pptx`
- `reports/compression-report.json`
- `reports/postprocess-result.json` 中的 `delivery`

### PDF/PPTX 规范化与渲染

安装 Poppler 和 LibreOffice 后，可参考完整配置：

```bash
node skills/pd-hifi-slideclone/scripts/slideclone.js run \
  --config skills/pd-hifi-slideclone/examples/full-cli.config.example.json
```

可选环境变量：

- `PDFTOPPM_BIN`：自定义 `pdftoppm` 路径。
- `LIBREOFFICE_BIN`：自定义 `soffice` 路径。
- `SLIDECLONE_DPI`：PDF/PPTX 渲染 DPI，默认 `144`。
- `SLIDECLONE_PIXEL_THRESHOLD`：像素差异阈值，默认 `24`。

### PowerPoint COM 渲染与前景 diff

Windows 环境如果已安装 PowerPoint，可使用真实 PowerPoint 导出页面图：

```json
"render": "scripts/adapters/render-powerpoint-com.js"
```

`diff-pixel-png.js` 会输出：

- `pixelDiffRatio`：整页像素差异率。
- `foregroundMissingRatioRaw`：严格逐像素前景缺失率。
- `foregroundMissingRatio`：默认 2px 邻域容错后的前景缺失率，用于消化字体抗锯齿和微小位移。
- `diff/page-*.diff.png`：红色高亮差异区域的可视化 diff 图。

容错配置：

```json
{
  "diff": {
    "foregroundTolerancePx": 2,
    "foregroundToleranceDelta": 54
  }
}
```

`compare-placeholder.js` 作为阈值验收 adapter，会读取 diff summary 并输出：

- `metricSource`：实际 diff adapter，例如 `diff-pixel-png`。
- `checks`：逐项阈值检查结果。
- `editability`：文本框、形状、图片、表格、图表数量，可编辑对象数量，以及 `rasterImageAreaRatio`。
- `editability.nonEditableItems`：最多列出 30 个不可编辑对象及原因，方便继续把图片裁片对象化。
- `geometry`：防变形检查结果，包括元素越界列表、截图宽高比误差、`maxOutOfBoundsPt` 和 `maxImageAspectRatioDelta`。
- `warning`：仅列出当前环境尚未产出的可选指标；一旦 `source.evidenceBox` 可用于布局验收，`layoutMeanIoU` 和 `maxCriticalOffsetPt` 会按阈值参与必过判断；一旦启用真实 `textOcr.adapter`，`textCoverage` 会按阈值参与必过判断。

推荐把以下几何与可编辑性指标作为必过项；配置阈值后会直接影响 `passed`：

```json
{
  "thresholds": {
    "maxOutOfBoundsPt": 1,
    "maxImageAspectRatioDelta": 0.03,
    "maxRasterImageAreaRatio": 0.25
  }
}
```

前两项用于拦截常见变形：横幅/卡片跑出画布、截图裁片被非等比拉伸。`maxRasterImageAreaRatio` 用于防止整页截图或大面积截图裁片混过验收，推动文本、形状、表格和图表继续对象化。

PowerPoint COM 在连续自动化时可能留下无窗口后台进程；`render-powerpoint-com.js` 默认会在渲染前清理 `MainWindowHandle=0` 的隐藏 POWERPNT 进程，并对 COM 初始化与打开文件做重试。

### 图片版 PPTX 规范化

如果输入是“每页只有一张大图”的图片版 PPT/PPTX，优先使用 PowerPoint COM 直接导出逐页 PNG：

```json
"normalize": "scripts/adapters/normalize-powerpoint-com.js"
```

完整示例见：

```text
skills/pd-hifi-slideclone/examples/pptx-image-com.config.example.json
```

该 adapter 会输出 `reports/pptx-normalize-report.json`，并为每页记录：

- `sourceKind=pptx-slide-render`
- `imageOnly=true/false`
- `slideShapeCount`
- `slidePictureCount`
- `slideTextBoxCount`

其中 `imageOnly=true` 表示当前页基本可判定为图片版幻灯片，应按“整页图像证据 -> 区域抠图 -> OCR/视觉对象化覆盖”的链路继续高仿，而不是尝试直接读取 PPT 内部文本框。
