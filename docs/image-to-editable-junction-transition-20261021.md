# 交汇路径、区域边缘与运行时核查

用户已明确确认 fork subagent B/C → Worktree 均按方案 A 沿本侧曲线向下。通过已有完整源边目录校验后，本轮生成派生计划并执行实际 raw rebuilder：已接纳关系从 **9/11 提升至 11/11**，下层五条逻辑路径全部绑定。没有修改生产算法、源像素、门槛或测试，也没有新增模型观察；人工确认不等于自动识别消歧成功。组件、语义和整页编辑验收仍未完成。

证据目录：`.codex-temp/source-junction-transition-20261021-v1/`。上轮 `delivery-manifest.json` 的 199 项指纹在继续工作前全部通过复核。

## 人工确认已绑定两条关系，完整闭环保留

下层源网络保留 12 条物理边和一个闭环，输出保留 21 条原生边和五个已绑定逻辑路径。`relation-n206`、`relation-n207` 原先各有两条完整源路径；本次使用用户明确选择的 A，未以长度、枚举顺序、转弯形状或颜色替代关系身份依据。

`path-review.html` 展示原始像素和两个候选；历史 `pending-path-options.json` 原样保留，其等待状态只描述提问时点。新增 `human-path-selection.json` 记录直接用户回复、两条精确 `sourcePathChoice`、冻结计划和完整 catalog 指纹，明确 `automaticConsensus: false`、独立模型观察数为 0。`human-selected-plan.json` 仅为这两条关系增加已校验选择，原始冻结计划未改写。

`bind-human-selection.cjs` 使用 `captureSceneEdgeReview` / `readSceneEdgeChoice` 检查完整 catalog、连续步骤、端点、方向及无重复接点，再生成派生计划。`replay-human.cjs raw-replay-human-a-v1` 在冻结 OCR、源图和其他规划内容下回放，用已有完整 catalog 重投影流程验证端口投影变化。耗时 43.581 秒，模型调用为 0；五条选择均通过重投影。`junction-source-samples.json` 的交点 RGB 仍只用于诊断，不授予关系身份。

`verify-human-output.cjs` 调用实际 .NET builder，生成 `raw-replay-human-a-v1/compiled/actual-human-a-v1.pptx`（841763 bytes）。它验证全部 21 条物理边在 OpenXML 各出现一次、五条逻辑路径的连续性与端点、原有三条路径不变，以及源网络和原生网络均保留一个闭环。192 个形状、69 个文本和 30 个图像均与前轮一致；41 个 PPTX 解压条目逐字节相同。此次变化是为已有完整物理绘制补上两条逻辑身份，不增加或删除画面内容。

**11/11 的分母是已接纳关系。** 观察清单仍有 12 条，其中 `proposal-relation-0` 的 `relation-contract / tuple` 拒绝尚未解决，因此 `region-n3` 仍缺 `observed-relations`，完整区域仍为 7/12。不能将本次绑定报告为全部原始观察通过或整页完成。

## 完整端点观察没有解除区域描边阻塞

`raw-replay-full-bodies-v1/regional-compound-1-full-background.json` 在源窗口 `(216,385,507,338)` 中观察两个完整端点 body，使用独立的诊断 ledger：171366 次源读取，1509740 次几何检查。它没有增加生产预算或授予生产证明权限。

整窗及逐节点背景证书仍均未激活；全局 `(450,510)`、`(453,531)`、`(331,544)`、`(330,544)`、`(310,553)`、`(309,556)` 六个 cells 均不属于实际 body mask。原观察窗口裁掉节点的假设因而不能解释这些 cells，也不能授权删除或重新归属它们。回放仍为 9 条关系、30 个图像且组件和语义门禁失败；保留两个填充体及两个短连接。

`polyline-envelope.json` 进一步直接比较已保存的 794 个 shaft cells 到连续线段的距离，使用独立的 184208 次几何检查。14 顶点简化路径有六个越界 cells；原始 220 点路径仍有一个：全局 `(450,510)` 到原路径首段的距离为 `3.1622776602px`，超过原 `shaft/2 + .75 = 2.3887799061px` 的允许距离。其余五个 cells 在原路径下均进入原容差。这将简化造成的覆盖损失与端点附近的独立剩余问题分开；直接保留原始路径仍不能覆盖全部 shaft，且 220 点不能取代现有 16 顶点预算。未修改任何生产拟合或覆盖规则。

## 填充式自定义连接器未通过 Office 验证

`custom-connector-probe/` 是合成格式实验：将 builder 生成的闭合填充 `<p:spPr>` 放入真实 `<p:cxnSp>`，保留两端连接并移除重复填充体。它没有原图证明权限，也未接入生产。

最初实验在打开阶段返回 E_FAIL；ready 版本又因清理阶段的 `RPC_E_CALL_REJECTED` 丢失了原始报告，不能据此判断兼容性。随后 observed 版本在基准状态读取阶段失败。direct 版本改为直接保存 COM 对象并逐步写入取证：同一实例成功打开和导出基准 `control.png`，自定义候选打开时记录一次 E_FAIL（`-2147467259`）。其报告写入随后出现 IOException（`-2147024864`），连接器属性快照也不稳定，因此没有形成完整的移动、重路由、保存、重开证明。

`office-assessment.json` 明确区分已观察的基准导出、自定义打开失败、报告故障与未执行的编辑步骤。现有候选不能进入生产；本轮结果也不能推导出所有自定义连接器表达均不受支持。没有重新渲染真实整页。

## 共享 Worker 仍使用旧代码

`runtime-observation-v2.json` 是对运行中 `common-tools-public-image-to-editable-worker-1` 的只读核查，只输出允许的圆角模式环境项、选定源码指纹及布尔特征。该容器未设置 `COMMON_TOOLS_IMAGE_CONNECTOR_CORNER_MODE`，settings 源码没有该配置项，入口也没有转发 `settings.connectorCornerMode`。入口与 settings 指纹均不同于工作区；新增关系策略及迁移后的两个路由模块路径在容器内不存在。

这证明本地修复尚未在该容器激活，不能据此宣称当前容器实际选择了哪种新模式。本地默认仍是 `reroutable-elbow`；`auto` / `rounded-freeform` 的策略由已验证的每作业配置选择，IR 元数据不能选择语义门禁。此前定向策略回归 14/14，通过日志为 `worker-policy.log`。本轮没有重启、部署、提交、推送或新增 OCR/VLM 调用。

## 工程验证与继续条件

完整 `npm run verify:ci` 返回 1，日志为 `verify-ci-v1.log`，终态记录为 `ci-result.json`。Lint、两组 TypeScript、插件/能力/可观测性/ADR 检查、锁定 .NET 安全审计和 Release 构建、Python lock 校验均通过；789 个 unit、31 个 contract、93 个 integration 文件共 **913 个测试文件**通过。最终 `common-tools:verify-runtime-package` 在 `package-install` 阶段达到原有 300000ms 上限并返回 `timeout / ETIMEDOUT / SIGTERM`，尚未完成安装后 CLI 与依赖闭包消费检查。没有提高时限或跳过该门禁。

随后仅使用原命令重试最终包验证，**返回 0**，日志为 `runtime-package-retry-v1.log`，终态为 `runtime-package-retry-result.json`。实际打包 3843370 bytes / 1835 files，安装后验证 20 个包、6 项能力；CLI、生产依赖闭包、图像 Worker 消费与已安装模块检查均通过。原有 300000ms 命令时限保持不变。首次全量 CI 的失败记录保持不变；913 个测试文件及其前后阶段通过、最终包阶段独立重试通过，不能把首次全量运行改写为一次全绿。工程门禁不代表实际 Worker、整页像素或编辑操作通过。

两条人工路径选择已经落实。剩余工作包括拒绝观察项的契约修复、覆盖全部区域源边缘的原生表达，以及容器/图标残留和共享运行时激活。严格语义仍有 15 个固定关系绘制项，native-path 语义仍有两个填充体，二者均保留 `large-raster-lineage` 失败。生产组件与两种语义门禁保持失败；原始输入、闭环、浅色边缘和历史失败产物全部保留。未新增实际整页 Office 渲染或拖动/保存/重开验收，目标保持 active。
