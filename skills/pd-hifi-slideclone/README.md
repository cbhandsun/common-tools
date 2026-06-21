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
    "adapter": "scripts/adapters/ocr-umi-paddle.js",
    "mode": "anchored",
    "paddingPt": 16,
    "upscale": 1,
    "preprocess": false
  },
  "umiOcr": {
    "paddleBin": "C:\\Program Files\\Umi-OCR_Paddle_v2.1.5\\UmiOCR-data\\plugins\\win7_x64_PaddleOCR-json\\PaddleOCR-json.exe",
    "initTimeoutMs": 60000
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

打磨目标：

- 调整元素坐标、字号、行高、颜色、裁剪、层级。
- 按候选字体真实渲染并选择 diff 最低的字体，减少字宽、字重和抗锯齿差异。
- 对原图和生成渲染图做 OCR 回读，计算 `textCoverage`，抓漏字、错字和明显文本丢失；中文图片版 PPT 优先使用 Umi-OCR 内置的 PaddleOCR-json，Tesseract 作为兜底。
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

当 Tesseract 对中文截图漏字或误字较多时，优先切换到 `scripts/adapters/ocr-umi-paddle.js`；Tesseract 更适合作为无 Umi-OCR 环境下的轻量兜底。

### .NET Open XML SDK PPTX

先安装 .NET SDK，然后执行：

```bash
dotnet restore skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj
```

把配置中的 `pptx` adapter 改成：

```json
"pptx": "scripts/adapters/pptx-openxml-dotnet.js"
```

该 adapter 会调用 `dotnet run`，把 `ir/deck.json` 转成 `pptx/deck.pptx`。当前实现覆盖可编辑文本框、基础形状、图片和简单表格，后续可继续扩展 chart 和 icon 的 PresentationML 生成。

生成器会在写出 PPTX 后立即运行 Open XML SDK validator；校验失败会中止并输出无效节点路径，避免生成 PowerPoint 无法打开的文件。

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
