# 共享边容量修复与真实编辑验证

2026-10-24。目标尚未完成。工程修复通过合成源像素、编译及实际 writer 验证；两张真实图片没有新增完整关系或区域。PowerPoint 交互已完成一张真实卡片的移动、缩放、保存重开，并确认现有文件仍有旧位置残留。

## 通用修复

共享线网原有整组预算为 `max(32, (终端数 − 1) × 20)`，但中间阶段重复套用了单条关系容量：

1. 骨架简化与最少顶点搜索默认只有 17 个顶点，提前拒绝整组仍有余量的长边。共享调用现在传入由既有整组预算推导的容量；单条关系默认保持 17，源偏差 0.75px、512 个源样本和 4M 工作量保持。
2. 公共源边目录仍只允许 18 个定位顶点。现在与既有 writer 的 120 点上限对齐；目录仍须完整指纹校验，不授予源、绘制、端口或擦除凭据。
3. 逻辑路径将每个 writer 绘制段误计为独立物理源边。现在按连续段所属的同一私有源路径计数；原有 15 条物理边、512 个源样本及 4M 工作量限制保持，绘制引用仍受 128 条及整组实际部件数限制。
4. 编译器内部顶点 key 的间隔改为 128，避免长边的内部顶点与下一边碰撞；端点身份、源测量和锚点保持。

无图片 ID、坐标分支或真实图特例进入公共算法。新增合成四终端图的一条物理边需要 23 个顶点，完整测量后产生 49 个部件、26 个双端绑定原生连接器及 3 条完整关系，仍在原 60 部件容量内。实际 PPTX writer 保留全部连接器及引用，所有引用均指向存在的形状。

回归位于 `test/source-shared-edge-capacity.test.js`、`test/source-shared-route-choice.test.js`、`test/source-route-minimum-polyline.test.js` 和 `test/openxml-shared-edge-capacity-contract.test.js`；新 contract 已进入统一 CI。超过整组容量、物理路径过长、源样本过长、预算耗尽、错误指纹、空/非法/极端与 getter 输入继续拒绝。

证据目录：[shared-edge-capacity-20261024-v1](../.codex-temp/shared-edge-capacity-20261024-v1/)。`before.tap`、`catalog-before.tap` 和 `catalog-writer-after.tap` 分别保留旧拓扑、旧目录和后续路径计数错误的失败。最终 `catalog-writer-after-v3.tap` 为 17/17 通过；较早的 72 文件受影响回归通过，但启动早于目录及路径计数收尾，不能冒充最终完整 CI。

## 两张真实图

最终回放仍使用正常 raw 入口、冻结 OCR 和计划，零模型调用，没有共享 Worker、重新识别或新交付文件。

| 样本 | 关系 | 严格完整区域 | 相比前版 |
| --- | --- | --- | --- |
| 主图，含既有人工确认及限定近似 | 11 | 9/12 | 无新增 |
| 独立动态本体图 | 14/16 | 4/5 | 无新增 |

最终结果分别在 [主图 v2](../.codex-temp/shared-capacity-main-20261024-v2/replay-result.json) 和 [独立图 v2](../.codex-temp/shared-capacity-independent-20261024-v2/result.json)。独立图仍缺 `relation-n209`、`relation-n211`；两图严格语义和原生组件门禁仍未通过。

[最终输出比对](../.codex-temp/shared-edge-capacity-20261024-v1/final-output-comparison.json)按实际资产字节归一化临时路径后，确认绘制、文字/字体、图片及分组全部保持；主图 60 个、独立图 14 个双端原生连接器均有有效端点。真实产品增量仍为 0。

## PowerPoint 真实编辑

使用 Computer Use，仅操作已获准的验证副本，原候选保留。

- 首次选择主会话卡片 `object-n107`，只移动了 `scene-container-object-n107` 单个形状；文字、图标及连线未跟随。该操作已撤销。不能将它记作整卡验证。
- 随后选择真实组 `scene-unit-object-n120`（OpenTelemetry），实际移动并缩放，保存、关闭后重新打开。主体、文字、图标及蓝色连线的新位置保持。
- OOXML 比对确认改变了该组的 transform 和 `shared-7d801ca99e2bbf4a739c749d-edge-32` 的连接器几何，连接引用保留。这证实该连接器具备实际节点跟随行为。
- 旧位置仍有卡片边框和项目符号；这项失败在重开后仍可见。因此该卡片仍未通过“整体移动且旧位置无残留”验收。
- 验证副本期间出现额外的无关文字输入；诊断副本保留该现象，不作为干净交付文件。原候选未回写。

证据：[保存重开截图](../.codex-temp/shared-edge-capacity-20261024-v1/office-reopened.png)、`office-card-group-move.pptx`、`office-card-group-resize.pptx` 及 `office-move-diff.json`。主图交付候选仍为 [approved-native.pptx](../.codex-temp/crop-card-replay-20261024-v3/approved-native.pptx)，本次读取 SHA256 为 `66236cc96111c7e7d7ae592f0ceb2a9d39f8d1924cbbd0391d094106d4baaa8c`；此前交接中的摘要多抄了两个字符，此处已按文件纠正。

## 已定位的产品阻塞

正常入口的只读观察显示，主会话完整组因 `paint-order` 被拒：`scene-outline-object-n107` 与早期生成的 `native-graphic-underlay-2-visual-atom-connector-0` 重叠；类似冲突还出现在另外三张卡片。观察只记录原调用的返回结果，不修改源、输出或凭据。完整证据在 `group-observation-1.json` 与 `retention-observation-2.json`。

OpenTelemetry 的原生组已经包含其主体、轮廓、图标和全部四项文字；移动后留下的边框/项目符号不在这些原生成员中，仍属于其他保留层。下一项产品修复应处理源支持的重复识别对象与背景/前景分层，再以同一文件重复整卡操作；只修改连线曲率或增加合成测试不能消除此问题。

既有 n4/n6/n8 外框、n10 背景以及单条跨区关系近似授权范围保持，未扩大到其他卡片或独立图。严格源证明与实际编辑结果分别报告，未通过放宽门禁将此文件标记为通过。

## 当前工程验证

完整 `npm run verify:ci` 已在收尾代码冻结后启动，日志位于 `verify-ci.log`，终态以 `ci-result.json` 为准。冻结清单为 `inputs-before.json`；完成后须比对 `inputs-after.json` / `input-changes.json`，才可将完整 CI 关联到当前源码。
