# 共享连线背景保留候选与附件复核

日期：2026-10-23。结论：**附件未增加源细节；新的背景保留候选仅留作隔离证据，不合入生产。** 两种模式实际 Office 的整页数值略有净改善，但主要白缝、重复原线和完整卡片缺项仍在，不能计为完整区域增长。没有新增逐点零退步产品门槛，也没有调整既有门槛或 baseline。

## 附件比对

本次重新使用 Pillow 独立解码 JPEG 附件及冻结 PNG：[完整结果](../.codex-temp/shared-background-preservation-20261023-v1/source-comparison-v1.json)。两者均为 1086×1448，1,572,528 个 RGB 像素全部相同，RGB SHA256 均为 `5771a1024c88c03b8bd7121f8400518a5591ce3a596b54c1776107d7513d2ebc`。容器文件摘要不同不表示图像细节增加。本轮不换源、不重复 OCR，也不要求用户继续寻找已经确认不存在的原文件。

## 隔离合同与验证

目录：[shared-background-preservation-20261023-v1](../.codex-temp/shared-background-preservation-20261023-v1/)。全部实现改动位于其 `sandbox/`；没有修改生产源码或配置。

同一次原测量复用已读取的源像素和背景距离，将未 blocked、alpha255、相对既有背景最大 RGB 通道差≤18的 cell 私下记录为低对比背景候选。原≥42入墨阈值、拓扑几何及其预算不变。新增可选背景位不挤占后续必须几何预算。

残差侧只允许 `newMask_i = oldMask_i \ background_group`，由完整 RGBA、原测量 buffer、实际全部输出成员快照、唯一端点和几何绑定；背景结果使用单独的 `backgroundCells` 属性，不授予 paint 所有权。先保留所有原 mask，再暂存全部替代行 runs；可选400万 work 或30000 mask超限时整批使用保留的旧 mask。非共享 owner 继续执行自己的旧 mask，即使与恢复候选重叠。填充约束保留原路径。

新8项专项回归与既有14项共 **22/22** 通过：[日志](../.codex-temp/shared-background-preservation-20261023-v1/regression-v1.log)。覆盖逐像素子集/对角走廊、18边界与19..41未知边缘、opaque AA限制、blocked正文/节点、完整源漂移、缺失/复制/重复/漂移成员、独立owner重叠、专用fill及预算/行数整批回退。测试仅在隔离 sandbox，不宣称进入生产统一CI；本轮没有对这组候选运行完整CI、Lint或类型门禁。

正常回放使用现有 raw rebuilder、同一冻结 OCR/计划和人工答复，全部 core 导入与 review adapter 映射至同一 sandbox 模块体系，没有复制或制造私有凭证。v1/v2 的模块加载失败原样保留；实际有效产物均为 `raw-replay-background-{mode}-v3`。

[静态对照](../.codex-temp/shared-background-preservation-20261023-v1/replay-comparison-v1.json)确认两种模式所有形状、文字、29项其他图片实际字节、编译、完整 strict/path 语义和区域报告保持。唯一图片变化为 `full-slide-residual`，分别从alpha0恢复4,767/4,119点到alpha255，每个恢复点RGBA精确等于原图，0新增擦除。其 `ownedForegroundRatio` 随实际mask缩小而变化，`remainingOwnedForegroundRatio` 和 `unownedChangedRatio` 保持0；不把此变化隐藏成全元数据相同。完整成员背景坐标和实际 runs 均已保留。

## 实际 PowerPoint 整页结果

使用现有生产 writer 和 PowerPoint COM adapter，完整导出两模式；与白楔修复后的各自同源基线相比：[完整数值](../.codex-temp/shared-background-preservation-20261023-v1/whole-page-v1/result.json)。均为冻结本地回放，不是新的共享 Worker/OCR 验收。

| 指标 | auto基线 | auto候选 | reroutable基线 | reroutable候选 |
| --- | ---: | ---: | ---: | ---: |
| PDR | 7.686731% | 7.685650% | 7.766857% | 7.766030% |
| Missing | 1.974606% | 1.962327% | 1.977246% | 1.969193% |
| MAD | 8.140204 | 8.121660 | 8.197466 | 8.182032 |
| Office像素改变数 | — | 8,467 | — | 7,256 |
| 误差改善/退步点 | — | 7,710 / 648 | — | 6,507 / 652 |
| 新增均RGBA差>24 / 恢复点 | — | 5 / 22 | — | 7 / 20 |
| 最大均RGBA误差增加 | — | 6.25 | — | 8.5 |

原 PDR≤8%、Missing≤12%、MAD≤12 的数值门槛均通过。PDR净改善为17/13个点，约0.001081/0.000827个百分点；不能描述为主要残影问题已经修复。全部5/7新增失败坐标与前后误差保留，未删除或更换baseline。

独立复核使用完整源、原mask谓词、背景sets和实际runs，对40/50个共享成员逐cell检查；分别4275/4629个原mask变为4737/4955个最终mask，严格保持set-minus合同。完整资产与语义对照见[独立报告](../.codex-temp/shared-background-preservation-20261023-v1/independent-v3-review-v1/review.json)。实际包及Office邻域的补充复核在同目录单独保存。

[独立Office复核](../.codex-temp/shared-background-preservation-20261023-v1/independent-v3-review-v1/office-review.json)另以Pillow重算完整指标，并比较两模式各41项PPTX解压entry：仅`ppt/media/image.png`改变，slide XML及其余条目实际字节一致。auto的5点中心残差均未变、邻域发生恢复；reroutable中3点属于该情形、4点中心恢复opaque，全部3×3无新增透明。这些观察不足以证明某个AA源点单独造成最终退步；完整邻域保留，不作源归属或逐点因果推断。

## 采纳决定与边界

低对比并不证明纯背景：已合成的截图AA同样可以alpha255且距背景≤18。恢复exact-source像素也不能保证Office最终合成改善。这个候选没有处理其余underlay内保留的原线，也没有补三个缺失外框或完整卡片编辑；主要问题保持，且增加了一套测量、来源绑定及残差预算合同。综合收益与维护成本，本轮**不迁移到生产，不继续本候选的同类阈值枚举**，保留有轻微净改善的事实及全部局部退步。这不是由少量AA点新增一个产品硬门槛，也不是对全部背景保留方法的否定。

当前仍为 **11条接纳关系、9/12完整区域**。n4/n6/n8三个外框、残影及整卡操作缺项保持；严格semantic/native-component及整页产品验收未完成。没有共享Worker激活、部署、重启、提交或推送。既有工程通过不转用于本隔离候选。

末次[本地终检](../.codex-temp/shared-background-preservation-20261023-v1/local-final-verification-v2.json)验证两模式12项隔离源码绑定和66项生产输入绑定保持，检查本轮文档UTF-8、空白及新增本地链接。计数包含两模式重复绑定；不将文档检查表述为工程CI或产品通过。
