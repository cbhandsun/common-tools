# 通用能力与单图结果的当前边界

2026-10-24。目标仍未完成。公共代码修复不能等同于多图产品验收；此前授权的外框、卡片背景及单条关系近似也不能推广到其他图片。

最新检查见[共享边容量修复与真实编辑验证](image-to-editable-shared-capacity-office-20261024.md)：共享长边已贯通测量、目录、路径绑定及实际 writer；两张真实图仍无新增关系或区域。PowerPoint 已完成 OpenTelemetry 卡片的移动、缩放、保存重开，连线实际跟随，但旧位置仍有边框和项目符号，整卡编辑验收未通过。主会话完整分组因早期重复边线的层级冲突被拒，已定位原因。

## 当前真实图片回放

以下在独立背景像素修复后，由正常 raw 重建入口重新运行，使用留存的 OCR 和计划，零模型调用；没有启动新的识别或共享 Worker，也没有完成本轮 Office 拖动验证。

| 样本 | 当前关系 | 严格完整区域 | 严格语义及原生组件 | 本轮变化 |
| --- | --- | --- | --- | --- |
| 主图，含既有人工确认及限定近似 | 11 条 | 9/12 | 未通过 | 保持 |
| 独立真实图片，动态本体图，无主图近似授权 | 14/16 | 4/5 | 未通过 | 保持 |

- [主图当前回放](../.codex-temp/crop-card-replay-20261024-v5/replay-result.json)：约 87.9 秒，主图原生跨区关系仍有 13 个双端绑定连接器，严格清单的 `unit-members-unexpected` 继续保留。
- [主图绘制与分组核查](../.codex-temp/cross-real-default-replay-20261024-v1/main-no-regression.json)：按实际资产字节归一化随机临时目录后，形状、文本、图片、分组和 60 个双端连接器保持；这不是新的 Office 交互或像素验收。
- [独立图片当前回放](../.codex-temp/cross-real-default-replay-20261024-v3/result.json)：约 89.9 秒，完成的关系均采用原生连接器。`relation-n209`、`relation-n211` 两条弧线仍失败。
- 独立图片的源图及计划摘要保持；扫描未耗尽 4M 源预算。失败不是作业超时，也没有复用主图的特殊授权。

本轮没有新增用户可见的真实图片关系或完整区域。现有 PPTX 候选仍为 [v3 approved-native.pptx](../.codex-temp/crop-card-replay-20261024-v3/approved-native.pptx)；v4/v5 仅是重建 IR 回归，没有重新生成交付 PPTX。

## 独立背景像素修复及交互验收

`routing/source-route-coverage-width.js` 在斜向采样时，连续两次舍入可能读到同一个背景像素。此前将它计为两个独立背景依据，可能误接纳缺少背景支持的细线。现在每一侧只累计不同像素；源预算、颜色阈值、扫描范围和线宽上限保持。

新增 `test/source-route-distinct-flanks.test.js` 覆盖单像素误接纳、两个真实背景像素、反向遍历、缓存、源字节不变及预算耗尽，由统一 unit CI 发现。旧行为的确定性失败保留在 [修复前回归](../.codex-temp/cross-real-default-replay-20261024-v2/distinct-flanks-before.tap)。本次重新执行的[相关回归](../.codex-temp/generalization-checkpoint-20261024-v1/routing.tap) 46/46 通过，没有跳过测试。该修复提高证据正确性，但上述两张真实图的关系和区域均未增加。

用户已经明确恢复桌面验证。验收副本 [office-verification-copy.pptx](../.codex-temp/native-v3-office-20261024-v1/office-verification-copy.pptx) 的初始副本来自交付候选；原候选当前 SHA256 为 `66236cc96111c7e7d7ae592f0ceb2a9d39f8d1924cbbd0391d094106d4baaa8c`，纠正此前交接中多抄两个字符的摘要。早期桌面工具超时后，现已通过 CUA 完成实际移动、缩放、保存重开。连线跟随通过一张卡片的实测，旧位置残留未通过，详见顶部最新检查；不再请求已经取得的恢复授权。

## 本轮公共修复

`routing/source-compound-route-width.js` 原先把整条骨架能否压缩到 16 个顶点作为独立背景线宽校准的前置条件。宽箭头内部的骨架可以有多次横向抖动；这些点属于已经单独证明的箭头，却会阻止保留细线的逐样本线宽测量。

现在完整骨架不能简化时，仅不使用它的可选直线切向；仍尝试独立扫描背景，对每个原始保留样本执行原有校准。1–5px 线宽、18 色差、240 alpha、连续样本、4M 工作量、最终 16 顶点及 32 部件容量均保持。该测量结果不授予源擦除、端口或输出几何权限。

回归用不同长度的合成弧线与宽箭头证明这项边界：较短案例完整输出通过并保留 9 个顶点；较长案例仍因原 4M 几何预算拒绝。空白、透明、耗尽预算及既有异常输入回归保留。

- [旧行为回归](../.codex-temp/cross-real-default-replay-20261024-v1/width-before-v2.tap)：1 项失败，确定性复现。独立进程预加载旧条件，未回写生产源文件。
- [修复后相关回归](../.codex-temp/cross-real-default-replay-20261024-v1/width-after-v2.tap)：32/32。
- [路由、来源绑定及分组回归](../.codex-temp/cross-real-default-replay-20261024-v1/route-affected.tap)：43/43。
- 新测试位于既有 `test/source-compound-route-width.test.js`，由统一 unit CI 发现；测试 helper 的原默认几何保持。

这是一项可复用的公共错误修复，但两条真实弧线还存在局部线宽采样问题，不能将上述合成通过记为 14/16 到 16/16 的提升。

## 实际诊断与未采纳路线

只读运行时观察确认：主薄箭头检测把宽箭头末端当成细线的背景或小箭头，触发 `route-source-background` 和 `route-arrow-direction`。复合头部已经获得源证明，随后线宽校准先因完整骨架顶点容量失败；修正这个前置错误后仍有局部样本被拒。

初步怀疑的“只取第一个头部候选”没有得到因果验证：其他候选也未获得完整结果，因此没有修改生产头部选择逻辑。局部切向、连续积分等观察实验也没有让两条弧线完整通过，代码仅保留在临时证据目录，未进入生产。没有放宽校验或用固定矢量路径宣称原生跟随成功。

观察证据在 [cross-real-default-replay v1](../.codex-temp/cross-real-default-replay-20261024-v1/observations.json) 与 [源法线样本](../.codex-temp/cross-real-default-replay-20261024-v1/width-samples.json)。这些资料用于定位故障，不是新的准入凭据。

## 工程门禁边界

包含独立背景像素修复的当前[两套类型检查](../.codex-temp/generalization-checkpoint-20261024-v1/typecheck.log)、[完整 Lint](../.codex-temp/generalization-checkpoint-20261024-v1/lint.log)及 `git diff --check` 通过。[退出状态](../.codex-temp/generalization-checkpoint-20261024-v1/gates.json)均为 0。Lint 同时校验架构预算、包边界和运行时载荷；7 个既有递减预算例外保持，没有新增例外。

[输入比对](../.codex-temp/cross-real-default-replay-20261024-v1/input-changes.json)确认既有 2943 个代码、配置及测试输入仅改变本轮线宽模块、回归测试及合成 fixture 三个文件。当前检查的冻结清单保留在同目录 `checked-inputs.json`；该清单不代表全量 CI 已通过。

此前完整 `verify:ci` 已结束：unit、contract 通过，integration 因 `runtime-shared-route-consumer.test.js` 首项的子进程在原 60 秒内未退出而失败。该完整 CI 启动后源码发生过变化，不能作为当前冻结输入的最终完整门禁。

同一共享 Worker 消费回归在保留 60 秒单进程期限的独立重跑中 8/8 通过，约 175.1 秒；保留[完整 CI 失败](../.codex-temp/native-static-render-20261024-v1/final-verify-ci.log)和[独立重跑](../.codex-temp/cross-real-default-replay-20261024-v1/consumer-isolated.tap)。这不足以证明并发条件下的问题已经解决，不调高超时冒充全量通过。

随后核实：安装包的 `shared-route` 探针早已采用用户获准的 120 秒配置，而上述 CI 文件仍独立硬编码 60 秒。这一不一致已修复：新增统一的 `runtimeProbeOptions`，安装包探针与 CI 消费同一配置；普通探针仍为 60 秒，共享仍为 120 秒，输出上限仍为 4096 字节，失败退出及全部反例断言保留。当前[实际 Worker 消费回归](../.codex-temp/shared-probe-policy-consistency-20261024-v1/integration.tap) 8/8 通过（八个测试合计约 244.2 秒，不是单个子进程时限）；[相关单元及契约回归](../.codex-temp/shared-probe-policy-consistency-20261024-v1/unit.tap) 32/32 通过，类型与完整 Lint 通过。[完整证据和边界](../.codex-temp/shared-probe-policy-consistency-20261024-v1/README.md)保留原 CI 失败，尚未重跑完整 CI，不声称并发和共享生产环境通过。

两条弧线另作隔离实验：将整条线的宽度估算与局部 5px 样本拒绝暂时分开后，完整轮廓候选可获得证明，但原生折线仍被原有几何和部件容量检查拒绝。没有将实验加入生产，也没有采用固定轮廓替代用户要求的原生跟随。该实验改变了下一步定位范围，但没有提高真实图关系或完整区域计数。

后续产品进展应以固定多张真实图片的新增完整关系、完整区域和同一交付文件的实际编辑行为衡量。测试数量、公共模块数量、局部证据及单张授权候选不计作整体验收完成率。

后续已修复原生折线路径的部件换算错误：17 个顶点实际只需 31 个部件，仍在原 32 部件容量内。71 文件、379 项路由回归及实际 writer 的端点契约通过；两张真实图片再次正常回放，全部绘制、字体、资产字节和分组保持，关系和完整区域没有新增。完整 CI 已启动并完成 unit、contract，integration 仍运行，但启动早于本轮容量改动，不能代表最终输入。Office 启动两次遇到 helper window-opened handler 错误，未执行编辑。完整证据及下一表示边界见[原生路径部件计数修复](image-to-editable-route-part-accounting-20261024.md)。
