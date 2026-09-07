---
name: "pd-hifi-slideclone"
description: "Codex/工程化高仿方案自动流水线：从图片版 PPT、PDF、逐页截图提取 OCR 与视觉结构，生成可编辑 PPTX，并通过截图 diff 迭代校验。"
metadata:
  alias: "@slideclone"
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
- 手工测量图标裁片时，禁止把聊天预览或缩放截图上的坐标直接用于原始图片。必须读取原图实际宽高，并用独立的 X/Y 比例映射；可复用 `scripts/lib/icon-crop-refiner.js` 的 `mapReferenceBoxToSourcePixels`。先留安全边距，再逐边收紧，避免把标题、说明文字、虚线、邻接箭头或相邻图标一起带入。
- 当候选裁片同时包含实心图标、卡片边框、文字或细连接线时，先基于候选裁片自身做高密度前景分量选择，再回映射到原图生成最小单元裁片；不得为单张页面写死绝对坐标。可复用 `refineDenseIconCrop`，它用局部像素密度与色彩饱和度选择主体，并清除主体邻域外的干扰像素。若图标属于语义关系图，优先由已识别连接线端点或邻接节点推断污染边，仅在关系几何缺失时才使用候选组中心兜底；再用 `intrusionEdges` 对命中的边执行同一套窄连接侵入检测。若箭头与主体边缘发生重叠，应根据边缘扫描线与内部稳定轮廓的中心漂移，仅删除偏离轮廓的重叠凸起，不得直接扩大整边裁剪量。上、下、左、右必须共享算法，不得按页面象限、单张样例或固定坐标设置独立阈值。输出应记录推断边、各边裁剪量与重叠像素清理量，便于质量门禁发现过裁和漏裁。只有语义检测已确认页面结构、且候选数量处于安全边界内时才能批量替换。
- 浅色背景图标优先执行“边缘连通背景透明化”，而不是按全图统一白色阈值抠除；这样可保留图标内部的浅色填充。随后用 `refineStandaloneIconCrop` 保留主体及主体边界内的断开细节，删除外部邻接组件。最终必须在透明棋盘格、深色底和页面原底色上分别检查毛边、白边、残字、断线、内部圆点丢失与裁切缺口。
- 图标裁片的 IR 证据至少记录原始像素框、坐标参考尺寸、映射后的像素框、收紧后的像素框、移除的邻接像素数和保留的内部细节组件数。图标仍是独立可移动图片对象，但不得宣称其内部像素可编辑。
- 图表优先还原为数据驱动 chart；缺少数据时用形状和文本近似，并保留截图证据。
- 连线和箭头通常优先使用 PowerPoint 原生 connector 与 arrowhead。直线用 `connectorType=straight`，折线用 `connectorType=elbow`。曲线 connector 只有在真实 PowerPoint 导出验证路径稳定时才能交付；PowerPoint 可能在打开文件时对绑定到形状的曲线重新路由，生成 S 形或改变切线。
- 闭环、环形流程等必须保持固定曲率的路径，如果曲线 connector 在 PowerPoint 中发生自动重路由，改用 Office 原生 `arc` 几何形状，并把箭头写入弧线自身的 `a:headEnd` 或 `a:tailEnd` 线端属性。主 OpenXML 生成器直接从 `style.endArrow`/`style.startArrow` 写入原生线端；只有兼容生成器确实丢弃弧线箭头时，才对新输出文件调用 `scripts/lib/arc-line-end-ooxml.js` 的受限 PPTX 修补接口，且不得覆盖源文件。不得用独立三角形模拟箭头，因为它不会随弧线端点移动并容易错位。
- 连接线必须先记录语义起点、语义终点和方向，再映射到具体生成库的端点字段；不能根据字段名猜测 `head`/`tail`。至少用一张实际导出的页面确认“箭头落在语义终点”。对流程图可调用 `scripts/lib/connector-semantic-audit.js`，按源图定义的有向边检查端点、单向/双向箭头和水平/垂直轴偏移；失败必须进入 findings，不能只靠肉眼忽略。
- 语义连接元数据还应记录期望路由族（`straight` / `elbow` / `curve` / `arc`）以及是否必须显式锚定。对图标裁片或没有可靠原生连接点的对象，创建无填充、无线条的锚点对象，再把连接线绑定到锚点；`connector-semantic-audit` 必须检查路由族和起止锚点是否与语义节点一致。
- 源图要求水平或垂直的跨容器连接时，优先在容器边缘建立显式锚点，不直接依赖整个容器的自动连接点选择；自动路由造成斜线、交叉或多个关系汇聚到同一点时必须修复。
- 连接线应位于大背景容器之上、节点填充和文字之下。调整 z-order 后必须重新渲染检查文字是否被卡片填充遮住；不要把节点整体 `bringToFront` 当作通用修复。
- 重建常见关系时优先复用 `scripts/lib/connector-component-library.js` 的语义组件：`flow`、`feedback`、`cycle-fixed`、`bidirectional`、`support`、`memory`、`hierarchy`、`bus`。`cycle-fixed` 表示固定几何弧线与附着式 Office 原生线端箭头，专用于会被 PowerPoint 自动重路由的闭环。组件统一圆角端点、线宽和箭头规则，同时允许基于源图证据做受约束的颜色、线宽、虚线和路由覆盖；不要为每张图重新发明一套不一致的连线样式。
- 任何包含曲线 connector、弧线或自由曲线的页面，最终验收必须至少包含一次桌面 PowerPoint COM 导出；仅凭 artifact-tool、LibreOffice 或缩略图渲染不能证明 PowerPoint 打开后的路径稳定。
- 整页像素指标不得替代组件级门禁。原生重建完成后应调用共享的 `packages/slideclone-core/native-component-quality.js`：阻止用独立三角形模拟关系箭头，验证带箭头线条的线宽、端帽和线端尺寸，验证固定弧线只含一个语义箭头端，检查新精修最小单元裁片的原始/映射/收紧像素框和清理证据，并确认声明移除整页残差后没有大底残差对象。新精修器必须设置 `cropEvidenceRequired=true`；历史裁片在完成证据迁移前计入 `unverifiedMinimumUnitCrops`，不得冒充已验证，也不能因缺少旧字段直接误杀整页任务。该门禁属于本地与团队共用重建核心，不能仅在某个客户端或单张样例中启用。
- 线条验收不能只看“有没有线”。必须逐条对比语义方向、起止边、端点偏移、折点位置、曲率、线宽、颜色、虚线节奏、箭头大小和层级；连接线应在大容器之上、节点填充和文字之下。每次修改锚点、路由或 z-order 后都要重新导出最终 PPTX 再比对。
- 线宽不得只凭 PowerPoint 的名义磅值或全局默认值判断。应在源图中选择至少 3 段避开箭头、交点、文字和抗锯齿边缘的直线横截面，取得有效像素宽度的中位数，再按 `sourceImageWidthPx / slideWidthPt` 换算并量化到 0.25 pt；可复用 `packages/slideclone-core/connector-stroke-calibration.js`。空样本必须使用显式、受边界约束的角色级 fallback，非法或极端样本不得静默扩散。实线、虚线、弧线和反馈线应按语义角色分别保留线宽证据，渲染验收以中心像素覆盖和边缘抗锯齿后的视觉粗细为准。
- 箭头大小通常随原生线宽联动，调整线宽后必须重新核对箭头长度、底边宽度和端点遮挡；若线身已匹配但箭头仍偏大或偏小，应使用生成器支持的原生线端尺寸属性，不能用独立三角形覆盖。虚线还需在最终渲染中核对短划长度、间距和端帽，禁止仅因 OOXML 中存在 `prstDash` 就判定样式一致。
- 箭头尺寸需要把“宽度”和“长度”分开拟合。先在避开节点边框的箭头区域测量尖端到基线的长度与基线宽度，再选择 Office 原生 `small`、`medium`、`large` 档位写入 `startArrowWidth` / `startArrowLength` 或 `endArrowWidth` / `endArrowLength`。不得用加粗线身代替箭头底边校准，也不得因箭头接触节点边框而把边框像素计入箭头尺寸。生成器必须为未提供尺寸的箭头显式回退到 `medium`，非法字符串也应安全归一化到该档位。
- 连接到透明 PNG、SVG 或带内边距裁片时，端点不得直接锚在图片矩形框。应在最终透明化资产上沿目标方向寻找最近的不透明轮廓点，并把该点以页面坐标记录为 `connectorAnchorPoint`；连接器和箭头尖端都必须使用这个轮廓锚点。找不到可靠 alpha 轮廓时才回退到矩形交点，并在证据中标记 fallback。
- 多条关系在源图中共享汇聚点时，必须保留汇聚拓扑。应先识别公共母线、节点中心轴或共同切点，再从同一页面坐标发出各分支；不得为了方便把每条线分别吸附到卡片四角。箭头与线身出现断缝、错轴或拉伸时，应先检查透明边距、公共汇聚点和端点方向，再调整箭头大小。
- 原生箭头的宽度档位会随线宽共同影响根部形态。若 `large` 箭头在短线或斜线上产生喇叭口、偏轴或明显宽于源图的根部，应保持已校准线宽并回退到 `medium`，不能继续缩短连接线来掩盖变形。箭头尺寸调整完成后，必须检查线身中心轴是否进入箭头根部中心，且尖端仍落在同一个语义轮廓锚点。
- Office 原生 `arc` 的 `headEnd` / `tailEnd` 不能只按屏幕上的左右或上下方向推断。相同弧形在不同调整角、翻转和旋转下端点映射会变化；必须同时验证：(1) 箭头线端属性与弧线位于同一个 `p:sp/a:ln` 内，(2) PowerPoint 实际导出中箭头落在语义目标端，(3) 箭头切线方向与弧线连续。若任一项失败，应调整弧线几何方向或线端映射并重新导出验证，不得通过独立三角形、延长线或遮罩补缝。
- 卡片、按钮、横幅等有层次的容器应优先使用 Office 原生外阴影 `style.shadow`，包括 `color`、`alpha`、`blurPt`、`distancePt`、`angleDeg`；不要用额外灰色图片模拟阴影。
- 卡片、按钮、横幅、连线等关键色块应优先从原图对应区域做安全采样；采样色与基准色偏差过大时必须回退到规则色，避免阴影、抗锯齿或文字污染导致整体变色。
- 大块 UI 截图、文档页、复杂流程图、照片和短期无法稳定对象化的视觉区域，应先裁剪为图片保证外观，再叠加 OCR/视觉识别出的可编辑文本、形状、表格或标注。
- 如果复杂截图位于外层卡片/步骤块中，只裁剪卡片内部的真实界面、文档页或图表内容；外层卡片标题、图标、底板、箭头必须尽量对象化为可编辑元素。
- 裁剪区域必须保留 `cropImage`、`evidenceBoxPx`、`confidence`、`strategy`、`reason`，便于后续人工或模型判断是否继续对象化。

### 本地与团队生产链路一致性

- 团队 Worker 必须把共享的 `local-production-parity-v1` 配置对象传给本地 `rebuildDeckFromWorkDir` 实现，不能另写一套近似参数。
- 该配置优先保留经 `refineStandaloneIconCrop` 精修的本地图标裁片，不默认把复杂状态图标矢量化。生成整页保真残差时，必须同时擦除原生对象和这些局部裁片覆盖的源像素，再把局部裁片作为独立图片对象叠回，避免重影。
- 团队多页任务的每一页都必须报告同一个生产配置；缺失或混用配置时，`local-production-profile-aligned` 门禁失败。团队视觉门禁使用与本地一致的 `pixelDiffRatio <= 0.08`，并保留 `foregroundMissingRatio <= 0.12`。
- 生产配置统一对象化文字、容器、连接线、表格网格和值横幅。线条仍须经过语义起终点、路由族、锚点和桌面 PowerPoint 导出校验，不能仅以对象数量或 LibreOffice 渲染通过代替几何验收。

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
- 整页 diff 还必须用 `packages/slideclone-core/component-region-quality.js` 计算组件区域差异，并在每页报告中保留最差对象的稳定 ID、角色、区域像素差、前景缺失率和归一化严重度。文字、局部图标、直线、弧线、容器边框、表格和图表分别使用角色级基线；低于最小前景证据量的区域不得误报。直线必须按带端点区的窄线廊取样，弧线必须按角度范围内的椭圆弧廊取样，空心容器只检查边框，避免把相邻文字或节点内容归罪于连接线。带负宽高的反向线以及水平、垂直零轴线也必须纳入审计。角色基线先生成 `attention` 诊断和排序；只有经过多类页面校准后才能升级为硬门禁，不得用单一阈值直接淘汰视觉密度不同的对象。

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

## 经验沉淀规则

当人工反馈指出一种可复现的高仿缺陷时，优先增强本 Skill 的通用规则或已有模块，不为单张页面另建 Skill，也不把该页的固定坐标写成通用能力。每项沉淀至少包含：触发条件、可复用实现或明确操作规则、正常/空/非法/极端输入回归测试，以及进入现有统一 CI 的测试文件。典型反馈应分别归入图标裁剪、背景透明化、连接语义、路由稳定性、渲染差异或交付门禁。
