# 图片转可编辑 PPT：源路径的连续有序身份校验

本轮修复源路径匹配的误接收、误拒和 512 样本边界。真实整页仍未验收：默认空页为 **3/11**，冻结 OCR 的完整 raw 回放为 **4/11**。没有放宽 1.5px、增加容量或调用模型。

## 修复与来源

此前 [路径复核](image-to-editable-path-review-20261021.md) 已对两幅观察进行连续有序共识，但最终源匹配仍使用无序距离：源样本到提案线段，以及提案顶点到离散源样本。这个不一致会接收倒序、同轨迹不同回环顺序，也会拒绝同一直线上不同分段位置的合法表示。

- [source-scene-path-distance.js](../packages/slideclone-core/scene-plan/source-scene-path-distance.js) 提供共享的连续 Fréchet 决策。约束两端、完整线段和单调遍历；不补点、不搜索或修改源路径。自由区间以叉积计算，避免大坐标下两个大平方数相减造成误差，没有增加数值容差。
- [source-scene-path-program.js](../packages/slideclone-core/scene-plan/source-scene-path-program.js) 的实际源匹配，以及 [source-scene-path-consensus.js](../packages/slideclone-core/scene-plan/source-scene-path-consensus.js) 的双观察共识使用同一内核。观察仍最多 16 顶点，实际源路径仍最多 512 样本；源匹配最多 511×15 个单元，所有区间计算进入调用方原四百万几何账本。两行最多保存 30 个右边界区间，另有当前单元的常量状态。
- [source-route-centerline.js](../packages/slideclone-core/routing/source-route-centerline.js) 的提取循环由 `count <= 512` 改为 `count < 512`。原来能返回第 513 个样本，与已声明的源路径容量及下游模块不符。现在 512 样本完整通过，513 样本完整拒绝，禁止截短后接收。
- [runtime-shared-route-consumer.js](../scripts/lib/runtime-shared-route-consumer.js) 在真实 Worker 消费前检查连续分段和反向路径。两个破坏性反例证明始终接收或始终拒绝的替身都会使消费探针失败。新模块加入安装包必需文件清单。

`before-after-regressions.json` 从修改前保留的实际模块加载旧实现进行对照：倒序与回环顺序从 `true` 变为 `false`；不同共线分段从 `false` 变为 `true`。这三项均有进入统一 CI 发现器的回归测试。

## 真实证据

证据目录：`.codex-temp/ordered-source-path-20261021-v1/`。原图 SHA256 保持 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。计划仍为上一轮 `real-n84xAO/replayed-final-plan.json`，模型调用为零，没有重做 OCR。

| 范围 | 结果 |
| --- | --- |
| 默认空页回放 | 3/11，下层整组仍在 `shared-path-program` 拒绝；`compile-evidence.json` |
| 首个实际不匹配 n204 | 141 个实际源样本，10 个提案顶点；起点误差 **3.816px**、终点误差 1.124px，源到提案最大距离 **1.883px** |
| 顶点离散误差诊断 | 提案顶点到连续源路径的最大距离同样为 **3.816px**，此次真实拒绝不能归因于离散采样误差；`replay-summary.json` |
| 完整 raw 回放 | **4/11**、29 个图像对象、39.61 秒；组件、严格语义和原生路径语义均失败；`raw-replay-ordered-v1/scope.json` |

对照诊断的额外距离计算不参与生产接收，也不改写原几何账本。真实提案仍偏离源证明，新校验没有把这类偏差变成成功。没有授予下层整组源擦除权限。

## 验证与后续

定向测试覆盖正常、空、非法、极端、安全、预算耗尽、连续分段、整段覆盖、反向、回环顺序、精确 1.5px 切线、大坐标、512/513 样本及实际绑定入口。最终广泛回归、类型、Lint、安装包消费结果与文件指纹见本轮 `delivery-manifest.json`；失败日志保留。

- `source-suite-v1.log`：统一 unit 发现器选出的 **187 个文件，1449/1449 通过，零跳过**；按原测试超时、单文件并发运行，未排除 Worker 消费或破坏性反例。
- `focused-v2.log`：定向回归 **33/33**；`contracts-v1.log`：真实 OpenXML 构建 **2/2**。
- `typecheck-v2.log`：两组 TypeScript 通过；`lint-final-v2.log`：Lint、2202 文件架构预算、1216 文件/20 包边界通过。七项既有例外未增加。首轮类型推断错误保留在 `typecheck-v1.log`，已通过显式 `number | undefined` 注解修正，未新增 `any`。
- `runtime-package-v1.log`：实际干净安装及 Worker、程序、共享路径和生产依赖闭包消费通过；**3,782,273 字节、1806 个文件、20 个包**。离线选项只作用于该命令，从已有 npm 缓存安装，结束后恢复环境；原五分钟命令预算与全部消费探针保持不变。
- 限定修改文件的 `git diff --check` 通过；新文件的 UTF-8、尾随空白及文档链接、代码围栏另外直接检查。

后续仍需解决完整路径观察的精度与身份表达。若改变观察范围或改用源网络身份选择，必须先证明完整源网络和全部合法分支仍保留，并保留双观察、唯一物理路径绑定及原账本。不能把诊断候选、枚举顺序或两幅不一致观察拼成最终路径。

尚未完成真实下层整组、其余未解析关系和原生对象、整页视觉/组件/语义门禁及 Office 编辑验收。本轮没有新模型调用、全仓单次 `verify:ci`、新 Office 验收、依赖升级、提交、推送、部署、重启或共享运行时变更。最终目标保持 active。
