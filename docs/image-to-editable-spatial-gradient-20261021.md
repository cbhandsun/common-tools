# 图片转可编辑 PPT：真实 n201 的源坐标多色标渐变修复

真实 raw 重建中的 n201 已从 **15 段 line + 14 个控制点**变成 **1 条开放圆角 freeform**，保留六个渐变色标、箭头和原端点绑定。整页仍只有 **4/11** 条关系通过；组件、严格语义、原生路径语义和整页视觉验收没有全部通过，目标保持 active。

## 根因与实现

空白页编译不是实际 raw 重建的充分替代。相同源图和冻结计划在实际 OCR/测量环境下选择了略有差异的源中心线与端点，n201 的路径颜色模型包含短距离颜色过渡。原有全路径空间渐变只支持两个色标，拒绝该颜色模型后回退为分段连接器。诊断也检查了 stroke core 取色，但其空间线性回归仍未通过；本轮没有修改中心线或改用邻域取色。

- [source-route-paint-fit.js](../packages/slideclone-core/routing/source-route-paint-fit.js) 抽出原有有界色标求解器，路径弧长拟合与源坐标拟合共用实现；兼容入口仍导出原来的颜色采样 API。
- [source-route-spatial-paint.js](../packages/slideclone-core/routing/source-route-spatial-paint.js) 保留原两色标快速路径；失败后才用原始源坐标拟合有界多色标。相同坐标上的所有颜色样本均参与验证，排序不会去重或平均掉相互矛盾的证据。
- [source-route-native-gradient.js](../packages/slideclone-core/routing/source-route-native-gradient.js) 将源坐标色标映射到原生路径的空间范围，仍最多六个色标，保持圆角模式与可重路由模式的坐标变换。
- [source-scene-route.js](../packages/slideclone-core/scene-plan/source-scene-route.js) 平移并深冻结源坐标证明，保留私有测量证明、完整几何、端点和方向约束。
- 新模块列入安装包必需文件。新边界回归、原编译回归及实际 OpenXML 回归进入统一 CI 发现器。

没有放宽 18 通道色差、90% 支持率、512 源样本、六色标、1.5px 路径身份误差或四百万几何账本。源几何、共享闭环身份、覆盖和擦除权限仍独立证明；非空间颜色变化仍保留分段表示，不能强行转成统一渐变。

## 真实验证

证据目录：`.codex-temp/source-junction-continuity-20261021-v1/`。源图 SHA256：`a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。冻结计划：`.codex-temp/source-contact-audit-20261021-v1/real-oKeW6y/final-plan.json`。所有原始输入和旧证据保留，没有新增模型调用、OCR、共享服务变更、重启或部署。

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 修复前实际 raw | n201 29 parts，整页 4/11 | `raw-replay-before-v1/n201-measured.json`、`scope.json` |
| 修复后实际 raw | n201 1 part，整页仍 4/11，68 行 OCR、29 图像对象 | `raw-replay-spatial-v1/n201-measured.json`、`scope.json` |
| 原始取样与输出复核 | 123 个原始样本；源拟合和最终原生渐变均为 90.243902% 支持；n201 测量几何不变 | `n201-paint-0.json`、`n201-native-sample-validation.json` |
| 整页实际 OpenXML | n201 单条开放 cubic、六色标、原生箭头；PPTX 847,558 字节 | `real-openxml-v1.json` |
| 下层完整线网 | 原 12 边、1 闭环、全部接触点及有序源样本完全一致；工作量 3,330,865 → 3,431,435 / 4,000,000 | `physical-preservation-v1.json` |
| 本机 PowerPoint 修复前 | PDR 8.0066618846%，Missing 2.0363947469%，MAD 8.3564855443 | `office-before-v1/diff/pixel-diff.iteration-0.json` |
| 本机 PowerPoint 修复后 | PDR **8.0039910259%**，Missing 2.0344143319%，MAD 8.3550486859 | `office-after-v1/diff/pixel-diff.iteration-0.json` |
| n201 原生编辑保存重开 | 在单独副本修改第一个控制点，x 增加 1.000244pt、y 不变；重开后仍为 10 个原生节点 | `office-edit-v1.json`、`office-edit-openxml-v1.json` |

修复后整页 PDR 仍大于 8%，不能四舍五入为通过。PowerPoint 对比使用冻结 OCR/计划和本地实际重建器；没有新的线上 Worker 作业或整页可编辑验收。原生路径门禁和组件门禁仍失败，29 个图像对象也没有消失。

## 工程验证

- 完整统一 `npm run test:unit`：**775 个文件、五个执行 shard 全部通过**，没有修改测试超时、发现器、CI、规则或 baseline。使用原 dot reporter，不据此推断总测试数或跳过数；见 `unit-v1.log`。
- 最终定向回归 **14/14**；实际 OpenXML **4/4**；Worker 消费与包边界 **13/13**。前三者由单独的 TAP 日志确认零跳过。
- 两组 TypeScript、全量 Lint、架构预算通过：2209 个文件、七项既有 decreasing-only 例外，零新增例外。
- 离线干净安装与 CLI/实际 Worker factory 消费验证通过：归档 3,793,555 字节、1811 文件、20 个工作区包；见 `package-v1.log`。此归档验证代码状态，本文在验证后新增。
- 未提交、推送或修改依赖。上一轮 23 个 scope 文件中，22 个完全一致，仅包必需文件清单加入本次新模块。最终指纹、dirty 保留检查及确切证据见同目录的 `delivery-manifest.json`。
- 修复前失败的最小回归、诊断与测试夹具调整日志均保留。

## 后续恢复点

[上一轮源边身份实验](image-to-editable-source-edge-choice-20261021.md)的一对观察已经用完，n206/n207 没有完整身份共识。不能自动重试、人工代填已知路径或用最短路径/邻近性选臂；下层仍须保持完整线网与整组接纳。

本轮补充定位保存在 `remaining-measurements.json`：n210 的带方向虚线观察失败为 `gap-visible-path`，普通路由为 `route-detached`；跨区 n107→n110 的可见间隙为 `gap-background`，普通路由为 `route-unrepresented-branch`。这些是当前拒绝原因，尚不是已经证实的算法误拒。后续应先保存完整源掩码、被拒候选和实际多余分支，补通用反例，再决定修复边界或纠正计划；不能只改 unresolved 文案或删除源分支。

随后仍需完成其余关系/原生对象、整页组件与语义/视觉门禁，以及整页编辑、保存重开和实际 Worker 验收。局部修复成功不代表完整目标已完成。
