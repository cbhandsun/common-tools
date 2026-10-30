# 路径简化保留源线条的完整覆盖

本轮修复了一个独立复现的生产缺陷：原始曲线可以覆盖完整源线条，但仅按中心线误差简化后，浅色边缘落到描边范围外，导致有效的原生连线被迫回退为固定填充体。修复保持原来的宽度、源 cells、端点、16 顶点上限和共享 4M 几何预算。

证据目录：`.codex-temp/source-footprint-polyline-20261021-v1/`。B、C 均沿本侧曲线向下的人工 A/A 选择继续使用；没有新增 OCR/VLM 调用。

## 根因与修复

`test/source-compound-route-geometry.test.js` 在既有曲线样本中加入一个仍与线条相连的浅色 cell `(67,49)`。该 cell 到原始连续路径的距离为 2.2361px，到原简化路径的距离为 2.8460px；原有 shaft=4，对应允许距离为 2.75px。原始路径合格，简化路径不合格。`before-regression.log` 保留修复前返回固定填充体的失败测试。

新增模块 `routing/source-route-footprint-polyline.js` 先尝试既有简化结果；其完整覆盖合格时逐点保留原结果。只有失败时，才将所有源 shaft cells 分配给最近的原始连续线段，在原始顶点组成的有向无环图中寻找至多 16 个顶点的路径。每条候选弦必须同时满足原有 .75px 中心线误差和完整源覆盖，最终再检查全部 cells。原始路径自身无法覆盖的 cell 直接拒绝，不能靠扩宽、删像素或移动接点消除。

`routing/source-compound-route-geometry.js` 使用该模块；原有箭头分区、背景侧翼、填充回退和编译证明继续执行。新增模块也进入边界 TypeScript 检查、运行时打包文件核验和统一 unit/all 测试发现，没有新增依赖、放宽门槛或改变 CI 排除项。

## 回归与工程验证

最新定向日志为 `focused-tests-v3.log`：29 项通过，零失败、零跳过。覆盖正常完整曲线、既有成功路径保持、原始路径越界、分支/闭环、容量和预算失败，以及非法、空、极端、getter/proxy 输入。恶意 getter 没有执行。预算测试还覆盖预先使用 3M checks 后的有效描边与填充回退；两者共用原 ledger，没有重置计数。

补充合成诊断 `native-fringe-integration-v2.json` 使用既有曲线集成样本和浅色 cell `(196,94)`，通过真实私有端口测量、生产编译器与语义审计，输出 10 条原生线段和九个既有机制的路由控制点，两端绑定保留，固定填充关系数为零。诊断中的旧中心线 helper 仅在隔离进程内模拟；修复前真实失败证据仍是前述 `before-regression.log`。初次诊断错误断言所有物理 parts 都必须是 line，遗漏已有的无填充控制点；其 v1 脚本和失败日志保留，修正诊断后通过，没有为它调整生产代码。这不证明 Office 拖动行为或真实页面通过。

首次类型检查发现新数组工厂缺少返回类型注解，已修正；`typecheck-v2.log` 和 `typecheck-result-v2.json` 确认两套 TypeScript 项目通过。本轮 `npm run verify:ci` 完整返回 0，日志为 `verify-ci-v1.log`，结果为 `ci-result-v1.json`：Lint、架构/依赖边界、两套 TypeScript、插件/观测/ADR、锁定 .NET 安全审计与构建、Python 锁文件及最终安装包消费检查通过。790 个 unit、31 个 contract、93 个 integration 测试文件共 **914 个文件**通过，并与当前统一测试发现清单逐项计数匹配。前轮 CI 不作为本补丁的验证。

独立安装包检查 `runtime-package-independent-v1.log` 返回 0：打包 3,850,088 bytes、1,838 个文件，20 个包和六项能力的安装、CLI、实际 Worker 工厂消费与生产依赖闭包检查通过。Worker 消费采用固定识别/渲染夹具，不是线上任务验收。

## 真实冻结回放与完整保留

`raw-replay-footprint-v1/` 运行实际 raw rebuilder，使用冻结 OCR、既有人工派生计划和保留的源路径目录，耗时 40.248 秒。它不是共享 Worker 的新任务，也不是新 OCR/VLM 或 Office 验收。

`verify-output.cjs` 独立核查 Deck IR、所有图像资产及实际 .NET writer 生成的 PPTX。仍有 11/11 已接纳关系、192 个形状、69 个文本和 30 个图像；下层五条逻辑路径、21 条原生物理边及一个闭环全部保留。所有形状、文本、图像资产和 PPTX 的 41 个解压条目与前轮逐字节一致。ZIP 容器时间信息可使整包 SHA256 不同，不据此宣称整包字节相同。

新增 `raw-replay-footprint-v1/compiled/actual-footprint-v1.pptx` 为 841,763 bytes，SHA256 为 `7a71791b9efb80143180494bf60effa7c561f473cc7d1a65f504ba9bf410196c`。原有人工 A/A 权威 PPTX 保留，其路径见[交汇路径记录](image-to-editable-junction-transition-20261021.md)。

`verify-replay-boundaries.cjs` 进一步核对区域完整 mask、原始路径和两种语义审计结果均未变化。区域证明消耗由 1,142,901 增至 1,148,076 checks，新增 5,175，仍在原有 4M 预算内。这只证明该真实样本及回归样本没有被额外搜索挤掉，不代表所有输入都具有相同开销。

第二次冻结回放 `raw-replay-ring-contact-v1/` 耗时 32.978 秒，观察既有 `isolateClosedSourceRing`，两次节点测量均确认 `(450,510)` 存在于最初 5,946-cell 连通分量中，而未进入隔离后的 4,066-cell 闭合环。`ring-contact-verification.json` 独立确认全部形状、文本、图像资产、共享图和语义审计结果仍相同。该诊断定位了源分区的分界，不能单凭“曾在输入中”证明它应归节点或宣布原分区错误；当前节点几何仍不足以绘制它。没有修改环宽、节点证明或生产分区逻辑。

## 仍未完成的边界

真实区域曲线继续保留两个完整填充体。此前取证确认的源 cell `(450,510)` 仍超出原始路径和实际投影路径的覆盖，不能由本轮简化修复接管；它也未获得节点所有权，详见[接触截面与绘制证明](image-to-editable-contact-crosssection-20261021.md)。

原始关系观察仍为 12，完整区域仍为 7/12。组件门禁和两种语义门禁继续失败：严格模式有 15 个固定关系绘制，native-path 模式保留两个填充体，`large-raster-lineage` 仍在。没有新整页 PowerPoint 渲染、拖动/保存/重开验收，没有重启、部署、提交或推送；共享 Worker 没有激活这些本地修改。目标保持 active，下一步仍需独立证明端点处节点与曲线的完整源绘制及最终原生几何。
