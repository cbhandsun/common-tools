# 原生连线回放修复与运行版本核对

2026-10-23。承接[有效基线说明](image-to-editable-native-baseline-status-20261023.md)。本轮没有用圆角候选替换已验收产物，没有更改近似授权范围、门槛、预算或共享服务。

## 有效基线及回退判断

正式有效文件仍为 [n10-approved-native.pptx](../.codex-temp/n10-approved-background-20261023-v1/office-static/n10-approved-native.pptx)，本轮重新验证其 SHA256 仍为 `c10d59e538322276aa1c8b8c4f5a067e553720997218fd6acd3801dcb601ae1c`。

下层网络具有 41 个原生连接器、82 个双端绑定；加上上层三个，合计 44 个、88 个绑定。此前六个业务端点轮廓移动、保存、关闭及重开的 6/6 跟随结果仍属于已验收实现。后续 `auto` 圆角自由路径候选没有这项能力，不能继承或替换该验收。此前把候选状态、完整区域缺项与有效基线混在一起汇报，造成了进度回退的印象。

本轮读取真实 Worker 默认配置并增加防退化回归：即使圆角编译分支必定抛错，默认 `reroutable-elbow` 仍不调用它，保留完整闭环、有序路径、原生 line 输出和实际节点双端锚点。测试由 unit/all 统一入口发现。它验证配置与编译组合，不能代替实际运行容器的配置核查。

## 回放阻塞及修复范围

之前两次回放停在已批准外框图片的摘要绑定，没有完成新正式交付。本轮查明，当前去重优化完成了原来在几何预算耗尽前未处理到的重复竖线。原生网络本身未变。

与 n10 基线逐 ID 比较，236 个形状变为 235 个，保留的 235 个全部相等，无新增或改写。唯一删除项为 `native-graphic-underlay-1-visual-atom-connector-5`，置信度为 0.3333 的兜底竖线。对应底图减少 112 个 alpha 像素，无颜色变化或新增不透明像素；记录归属为 `scene-relation-n209` 的重复绘制清理。旧去重账本为 4003105，当前为 2701418，原 4000000 预算没有提高。

通过原生产授权应用器重新应用同一份批准遮罩和 replacement bytes，适配去重后的真实资产摘要。逐像素检查证明：批准遮罩外、透明区、非原图像素的改动均为 0。n4/n6/n8 外框及 n10 底色的原授权均保留，未扩大范围。该适配目前是冻结回放的诊断集成，不宣称所有线上旧审批记录已自动迁移。

同时修复 `measureSharedRouteEdges` 的两个失败出口问题：所有拒绝分支统一返回 `shaftCells: null`，不发布不完整的捕获前缀；源覆盖检查耗尽预算时保留 `shared-geometry-budget` 原因，避免误报为墨迹缺失。新增三个回归，覆盖空/未覆盖源、预算耗尽和统一 CI 发现。

## 修复后同一份源码与产物

[v2 证据目录](../.codex-temp/native-baseline-replay-repair-20261023-v2/current-verification.json)绑定修复后的 3065 项输入，回放结束及独立复核时均未变。真实 raw rebuilder 使用冻结 OCR/计划，未新增 OCR/VLM 请求；源图、批准记录和历史产物未覆盖。

- [回放终态](../.codex-temp/native-baseline-replay-repair-20261023-v2/raw-replay-reroutable/scope.json)：11 条关系，严格区域 9/12，严格语义及原生组件门禁仍失败。
- [逐 ID 比较](../.codex-temp/native-baseline-replay-repair-20261023-v2/comparison-by-id.json)：全部 44 个共享连接器的完整 IR、渐变和锚点与 n10 基线一致。
- [成功路径复核](../.codex-temp/native-baseline-replay-repair-20261023-v2/current-verification.json)：失败出口修复前后的全部形状、69 个文字对象、30 个图像对象及资产字节一致。随机资产路径只在确认位于产物根目录并逐项验证字节摘要后规范化。
- [编译账本](../.codex-temp/native-baseline-replay-repair-20261023-v2/compiler-work.json)：下层保留 1 个闭环，输出 76 部件（41 个连接器、35 个控制点），输出检查 3579281，未突破原预算。
- [实际 writer 检查](../.codex-temp/native-baseline-replay-repair-20261023-v2/office-static/writer-verification.json)：新 [current-native.pptx](../.codex-temp/native-baseline-replay-repair-20261023-v2/office-static/current-native.pptx) 含 44 个共享 `<p:cxnSp>`、88 个有效 XML 端点绑定，SHA256 为 `0304973b1cd44906eeaac0eb581c6fabb58f08d2315cfe3622a7f94040094032`。

## 实际 Office 与工程检查

新文件已在真实 PowerPoint 正常打开，无修复提示，并通过 UI 另存为独立副本。独立读取[保存包](../.codex-temp/native-baseline-replay-repair-20261023-v2/office-static/office-verification.json)，确认 44 个共享连接器、88 个具名端点绑定，以及全部共享几何、渐变、描边和数值变换保持。Office 省略 `flipH="0"` 等默认值，仅对这些等价序列化做规范化。对象属性总数保持为 440。

本轮没有移动业务端点或完整卡片，没有对保存副本重开，也没有新像素门禁；不得据此宣称新的 6/6 跟随或整页外观通过。对象选择没有保存任何内容修改，PowerPoint 已正常退出。

修复后检查结果：

- 两套 TypeScript 检查通过；全量 Lint 终态通过，另补修复文件和新增回归的定向 ESLint。
- 统一测试发现中的 75 个路由相关文件、387 项测试全部通过，无 skip；另一个直接运行的 11 项组合测试与其有重叠，不相加。
- 实际生产 writer 成功生成 PPT，独立 XML 检查及真实 Office 打开保存通过。
- 本轮没有重跑完整 `verify:ci`、依赖安全审计或锁定 .NET 构建。没有修改依赖或 C# writer；历史完整 CI 不算作本轮结果。Lint 中已有的 7 项递减预算例外保持，不宣称清零。

诊断脚本曾先后因遗漏嵌套资产路径、误用文字数组字段及未规范化默认 false 而失败，失败版本保留；最终比较未删除绘制属性、跳过对象或改变生产门禁。

## 共享运行环境

[只读容器核查](../.codex-temp/native-baseline-replay-repair-20261023-v2/runtime-observation.json)发现，共享 `common-tools-public-image-to-editable-worker-1` 运行旧镜像 `common-tools-image-to-editable-paddleocr:offline-20260923`。其 `/app` Worker 入口没有 `connectorCornerMode` 接线，模式环境变量未设置，且没有本轮宿主代码中的原生链及共享路由编译模块。该容器与本地验收源码不同，不能把本地已通过能力描述为共享服务已生效。

此差异可能造成用户看到不同转换行为，但本轮没有重新提交真实共享服务作业，不能据此断言用户某份具体文件的来源。没有部署、重启或修改共享配置，也未读取输出其他环境变量或凭据。

## 后续准入

原生可重路由基线继续有效。新的圆角方案只有在同一产物上补齐节点跟随、源关系身份、视觉和区域检查后才能替换。剩余完整关系主体、混合接触点、严格语义/组件门禁及共享 Worker 实际作业验收尚未完成，目标保持 active。
