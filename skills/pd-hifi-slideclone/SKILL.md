---
name: "pd-hifi-slideclone"
alias: "@slideclone"
description: "Codex/工程化高仿方案自动流水线：从图片版 PPT、PDF、逐页截图提取 OCR 与视觉结构，生成可编辑 PPTX，并通过截图 diff 迭代校验。"
---

# Slide Clone 高保真可编辑 PPT 还原

本技能用于把图片版 PPT、PDF 或逐页截图还原为“尽量像原图，且可编辑”的 PPTX。核心原则是证据驱动：OCR、视觉理解、中间 JSON、PPTX 生成、截图比对、自动打磨、压缩交付必须形成闭环。

## 触发条件

- 用户要求把图片版 PPT、PDF、截图还原为可编辑 PPT。
- 用户要求“尽量像原图”“高仿 PPT”“PPT 工程化流水线”“OCR + 多模态 + Open XML SDK”。
- 用户需要沉淀可复用的 Codex skill 或自动化脚本。

## 快捷指令

```bash
node skills/pd-hifi-slideclone/scripts/slideclone.js init --input ./input --out ./runs/demo
node skills/pd-hifi-slideclone/scripts/slideclone.js run --config ./runs/demo/slideclone.config.json
node skills/pd-hifi-slideclone/scripts/slideclone.js validate --ir ./runs/demo/ir/deck.json
node skills/pd-hifi-slideclone/scripts/slideclone.js validate --ir ./runs/demo/ir/deck.json --strict
node skills/pd-hifi-slideclone/scripts/slideclone.js gate --summary ./runs/demo/reports/delivery-summary.json
node skills/pd-hifi-slideclone/scripts/detect-regions.js --input ./input/page-001.png --out ./runs/region-test
```

## 输入类型

- 图片版 PPT/PPTX：优先用 `scripts/adapters/normalize-powerpoint-com.js` 经 PowerPoint COM 导出逐页 PNG，并识别每页是否为单张大图型幻灯片。
- PDF：先渲染为逐页图片，再 OCR 与布局识别。
- 每页截图：可直接作为 page images 输入。

## 标准流水线

1. 采集与规范化：收集输入页，统一页码、尺寸、DPI、颜色空间。
2. OCR：优先使用 Azure AI Vision、ABBYY 等商业 OCR；本地中文截图优先使用 Umi-OCR/PaddleOCR-json，Tesseract 作为兜底。输出文字、坐标、置信度、段落关系。
3. 视觉理解：用多模态模型识别页面结构，包括标题、正文、表格、卡片、图标、流程图、配色、字体层级。
4. 区域候选：识别页面中应先保真抠图的复杂区域，例如 UI 截图、文档页、复杂图表、流程图、照片和图标组。
5. 中间 JSON：每页拆成 `textBoxes`、`shapes`、`images`、`tables`、`charts`、`icons`，所有元素使用页面坐标。
6. PPTX 生成：优先用 .NET Open XML SDK 做深度 PresentationML 控制；Node/JS 可作为编排层。
7. 渲染：把生成 PPTX 导出为逐页图片，形成可比较的视觉结果；Windows 可优先使用 PowerPoint COM 真实导出。
8. 比对：与原图做像素、前景缺失、布局、文本覆盖率 diff，并生成逐页 findings 和 diff 图。
9. 打磨：根据比对结果回写坐标、字号、颜色、裁剪框、层级、图片透明度与可编辑策略，再重新生成与校验。
10. 压缩：在达标或达到迭代上限后压缩 PPTX 图片资源、删除隐藏参考层、去重媒体文件，输出最终包和报告。

## 图片版 PPTX 解析

当用户输入 `.ppt` / `.pptx` 且怀疑是图片版幻灯片时，优先选择：

```json
"normalize": "scripts/adapters/normalize-powerpoint-com.js"
```

该 adapter 使用本机 PowerPoint COM 打开源文件，逐页导出 PNG，并在 `reports/pptx-normalize-report.json` 记录 `imageOnly`、`slideShapeCount`、`slidePictureCount`、`slideTextBoxCount` 等诊断字段。`imageOnly=true` 的页继续按截图页处理：先做区域候选与 OCR/视觉理解，再生成可编辑文本、形状、表格和局部保真裁片。

## 中间 JSON 契约

中间 JSON 必须符合 `schemas/deck-ir.schema.json`。坐标采用 slide coordinate，默认单位为 point。每个元素都必须保留来源证据：

- `source.pageImage`
- `source.ocrProvider`
- `source.visionProvider`
- `confidence`
- `evidenceBox`

`validate --ir` 必须检查结构、重复 ID、box 数值、`source.evidenceBox`、图片资产存在性和不可编辑图片原因；`--strict` 模式下 warning 也必须导致失败，便于 CI 或自动门禁使用。

## 生成策略

- 文本必须生成可编辑文本框，不允许把整页贴成背景图作为最终结果。
- 原图中无法可靠识别的复杂装饰、照片、纹理可作为图片保留，但必须在 JSON 中标记 `editable=false` 与原因。
- 表格优先还原为 editable table；当结构置信度不足时，先还原为线条 + 文本框组合。
- 图标优先匹配可编辑矢量图形；无法匹配时裁剪为图片并标注。
- 对宝石、品牌标识、复杂工具图标、相机/魔棒等难以稳定矢量化的小图标，可做局部透明裁片，避免用过度简化的菱形/线条造成高 diff；裁片必须标记 `editable=false` 与原因。
- 图表优先还原为数据驱动 chart；缺少数据时用形状和文本近似，并保留截图证据。
- 连线和箭头必须优先使用 PowerPoint 原生 connector 与 arrowhead。直线用 `connectorType=straight`，折线用 `connectorType=elbow`，曲线用 `connectorType=curve`；不用独立线段/三角形拼接箭头，除非目标形状无法用原生连接线表达。
- 卡片、按钮、横幅等有层次的容器应优先使用 Office 原生外阴影 `style.shadow`，包括 `color`、`alpha`、`blurPt`、`distancePt`、`angleDeg`；不要用额外灰色图片模拟阴影。
- 卡片、按钮、横幅、连线等关键色块应优先从原图对应区域做安全采样；采样色与基准色偏差过大时必须回退到规则色，避免阴影、抗锯齿或文字污染导致整体变色。
- 大块 UI 截图、文档页、复杂流程图、照片和短期无法稳定对象化的视觉区域，应先裁剪为图片保证外观，再叠加 OCR/视觉识别出的可编辑文本、形状、表格或标注。
- 如果复杂截图位于外层卡片/步骤块中，只裁剪卡片内部的真实界面、文档页或图表内容；外层卡片标题、图标、底板、箭头必须尽量对象化为可编辑元素。
- 裁剪区域必须保留 `cropImage`、`evidenceBoxPx`、`confidence`、`strategy`、`reason`，便于后续人工或模型判断是否继续对象化。

当前 Open XML 生成器已覆盖：

- 可编辑文本框。
- 基础形状：矩形、圆角矩形、圆/椭圆、线条、三角形、菱形。
- Office 原生效果：圆角调整、connector arrowhead、外阴影。
- 图片元素：按 `assetPath` 嵌入 PPTX。
- 简单可编辑表格：按 `rows` 生成 Office 表格。

PPTX 生成器必须写入 `font.family`，中文文本需同时设置 Latin/East Asian/Complex Script typeface，避免 PowerPoint 用默认字体替换导致字宽、抗锯齿和换行差异。

内置区域候选能力：

- `scripts/detect-regions.js`：对单张 PNG 输出候选区域裁片和 `regions.json`。
- `scripts/adapters/normalize-regions.js`：在标准流水线中检测候选区域，默认把裁片作为原页上的 `images` 元素放回对应位置。
- `regionProposal.emitRegionPages=true`：调试时可额外把每个裁片当作独立页继续 OCR/视觉识别。
- `regionProposal.cropContainer=false`：默认对浅灰卡片/步骤块继续内裁，只输出真正的嵌入界面或文档页；设为 `true` 时才裁外层容器。

尚未完全覆盖的元素必须保留在 IR 中，并在报告里标记降级策略，例如 chart 暂时用形状组合或图片保留。

## 校验口径

每页至少输出：

- 原始页图。
- 生成页图。
- diff 图。
- `metrics.json`：像素差异、结构 IoU、文本覆盖率、OCR 文本缺失、元素偏移。
- `findings.json`：需打磨的问题清单，包含页面、元素、指标、建议动作。

建议阈值：

- `pixelDiffRatio <= 0.08`
- `foregroundMissingRatio <= 0.12`
- `layoutMeanIoU >= 0.86`
- `textCoverage >= 0.95`
- `maxCriticalOffsetPt <= 8`
- `maxRasterImageAreaRatio <= 0.25`

## 生成后处理规则

生成 PPTX 后必须执行后处理，除非用户明确要求只产出 IR：

1. `render`：导出 PPTX 页面图，不得只凭 IR 判断相似度。
2. `diff`：产出像素 diff、布局 IoU、文本覆盖率和元素偏移。
3. `compare`：按阈值给出 `passed`、逐页 findings、失败指标和可编辑性摘要。
4. `polish`：未达标时在 `maxIterations` 内更新 IR，并重新生成 PPTX。
5. `compress`：最终交付前执行资源压缩和隐藏参考层清理。
6. `delivery verify`：默认把压缩后的 PPTX 作为交付文件，并再次用渲染 adapter 打开导出；只有通过该验证，才能声明交付文件可打开且非空白。

当 `fontFit.enabled=true` 时，必须在正式比对前对候选字体逐个生成、渲染和 diff，选择分数最低的字体写入 IR，并把每个候选的 `pixelDiffRatio`、`foregroundMissingRatio` 和最终选择写入 `reports/font-fit-result.json`。

当 `textOcr.enabled=true` 且配置了真实 OCR adapter 时，`compare` 必须对原图和生成渲染图分别 OCR，计算 `textCoverage`，并把逐页文本覆盖率、字符数和缺失样例写入 `compare/text-coverage.iteration-*.json`。没有真实 OCR 时不得伪造该指标，只能保留 warning。

中文图片版 PPT 的文本回读推荐配置：

```json
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
  "cache": true
}
```

`mode=anchored` 必须优先使用 `source.evidenceBox` 对每个文本元素裁剪源图和生成图，逐框计算覆盖率；这比整页 OCR 更适合 PPT 高仿校验。官方 PaddleOCR 场景下默认保留原图色彩，避免二值化导致中文笔画丢失；若换回 Tesseract，再按页面质量调整 `psm`、`upscale` 与 `preprocess`。

打磨动作必须可追溯。每次自动修改都要记录：

- `pageIndex`
- `elementId`
- `before`
- `after`
- `reason`
- `sourceFinding`

压缩不得破坏可编辑性。文本、表格、形状和图表不能为了减小体积回退成整页截图；只允许压缩非编辑型图片资源、裁剪冗余媒体、删除临时参考层。

内置真实压缩能力：

- `scripts/adapters/compress-pptx-media.js`：重写 PPTX zip 包内 `ppt/media/*` 的 PNG/JPEG 图片，默认不降采样，只做保守优化。
- 输出 `compress/deck.compressed.pptx` 与 `reports/compression-report.json`，报告必须包含原始体积、压缩后体积、节省字节数、处理媒体数量和每个媒体 part 的动作。
- `postprocess.verifyCompressed=true` 时，必须对 `compress/deck.compressed.pptx` 再执行一次渲染验证，并把交付文件、来源和渲染结果写入 `reports/postprocess-result.json` 的 `delivery` 字段。
- 每次完整 run 必须输出 `reports/delivery-summary.json` 和 `reports/delivery-summary.md`，汇总最终状态、adapter、产物路径、硬指标、可编辑性、压缩结果、不可编辑原因和告警，作为自动门禁与人工 review 的入口。
- `gate --summary <delivery-summary.json>` 必须能复核交付摘要，检查 status、required checks、交付 PPTX 文件、交付渲染验证、渲染页数和可选覆盖阈值；失败必须返回非 0。
- 只有显式配置 `compress.maxImagePixels` 时才允许按像素上限降采样，避免默认牺牲高仿细节。

内置阈值验收能力：

- `scripts/adapters/compare-placeholder.js`：读取真实 diff summary，输出 `checks`、`metricSource`、`findings` 与 `editability`。
- `editability` 必须包含文本框、形状、图片、表格、图表数量，可编辑对象数、非编辑对象数和 `rasterImageAreaRatio`。
- `editability` 必须列出最多 30 个不可编辑对象及其原因，并按原因聚合数量；`thresholds.maxRasterImageAreaRatio` 用于拦截整页截图或大面积图片裁片冒充可编辑 PPT。
- `geometry` 必须检查所有元素是否跑出画布，并检查每个图片裁片的渲染框宽高比是否匹配原始资产宽高比。
- `layout` 必须基于 IR 元素当前框与 `source.evidenceBox` 计算 `layoutMeanIoU` 和 `maxCriticalOffsetPt`；零面积连线不参与面积 IoU，避免污染布局均值。
- `thresholds.maxOutOfBoundsPt` 默认建议 `1`，`thresholds.maxImageAspectRatioDelta` 默认建议 `0.03`；这两项用于拦截横幅越界、卡片错位和截图拉伸等变形。
- 对当前环境未产出的 `layoutMeanIoU`、`textCoverage`、`maxCriticalOffsetPt` 等指标，只作为 warning，不应伪造指标；一旦 `source.evidenceBox` 或真实 `textOcr.adapter` 让这些指标可计算，就必须按阈值参与 `passed` 判断。
- `diff-pixel-png.js` 必须同时输出严格前景缺失 `foregroundMissingRatioRaw` 与邻域容错后的 `foregroundMissingRatio`；容错默认 `diff.foregroundTolerancePx=2`，用于消化字体抗锯齿和 1-2px 级别位移，不代表允许内容缺失。

内置流程图打磨能力：

- `scripts/adapters/polish-flow-diagram-rules.js`：根据前景缺失等失败指标回写圆角半径、连接线宽度、箭头大小、字号和少量坐标。
- 打磨 adapter 必须返回 `changes`，每条包含 `pageIndex`、`elementId`、`field`、`before`、`after`、`reason`。
- 打磨后必须重新生成 PPTX、重新渲染并重新 diff，不能只看 IR 变化。

## 降级规则

- 没有 Azure、ABBYY、PaddleOCR 时，可先用 Tesseract 或占位 OCR adapter 生成空结构，不能宣称完成高保真。
- 没有 Open XML SDK 时，可先生成 IR 与 adapter 输入，不宣称已生成最终 PPTX。
- 没有 LibreOffice/PowerPoint 导出能力时，只能完成 IR 校验，不能宣称已完成视觉 diff 闭环。
- 没有真实压缩 adapter 时，只能输出压缩计划，不能宣称已完成文件体积优化。

## 完成回复要求

最终说明必须包含：

- 输入来源和页数。
- 使用的 OCR / 视觉 / PPTX / 导出 adapter。
- 生成的 IR、PPTX、diff 报告路径。
- 比对结果、打磨迭代次数、最终是否达标。
- 压缩结果、压缩前后体积、删除或降采样的资源清单。
- 未可编辑的元素及原因。
- 校验指标和未达标页面。
