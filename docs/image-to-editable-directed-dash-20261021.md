# 图片转可编辑 PPT：有向虚线的完整源证据

本轮关闭了有向虚线的错误接纳，并修复完整端头未进入原生虚线序列的问题。真实冻结 raw 回放的关系完成数从 **5/11 修正为 4/11**；PowerPoint 整页 PDR 从 **8.0095871107% 降至 8.0016381266%**，仍高于 8%。组件、严格语义和 native-path 语义门禁均失败，目标未完成。

## 根因与修改

[source-visible-dash-profile.js](../packages/slideclone-core/routing/source-visible-dash-profile.js) 原有三处完整性缺陷：

- 有向分支过滤掉轴向跨度不足两格的片段，但调用方仍将全部原始分量写入私有墨迹归属。未测量的片段因此可能获得擦除权限。
- 箭头仅比较外包框中心和宽度，没有独立证明方向、完整几何、分支和颜色；矩形及异色端头可能获得有向关系身份。
- 导出序列只有普通 dash，未加入端头/箭颈及其真实分隔间距；延长到箭尖的路径可能重复前面的序列。

现在每个原始分量都必须接受测量；完整、同轴的两列短 dash 仍可通过，偏轴短片段不能消失。极端分量只能提出端头候选，随后复用已有 `sourceVisibleGapProfile` 完整连续箭头观察器，检查头轴、方向、分支、宽度和全部颜色证据，并核对与其余 dash 的共同描边。端头及实际间隔进入同一原生 custom dash 序列。

仍使用原始源像素、掩码、私有端口、源范围、空走廊和四百万几何账本；没有增大颜色容差、修改质量阈值、增加依赖或获取新模型观察。复用的连续观察器需要可独立证明的头轴分量；孤立三角形或其他尚无完整证明的端头仍会拒绝，不能宣称所有有向虚线均已支持。

## 真实源证据

证据目录：`.codex-temp/source-terminal-shaft-20261021-v1/`。源图 SHA256 为 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`。计划继续使用 `.codex-temp/source-contact-audit-20261021-v1/real-oKeW6y/final-plan.json`，输入为 68 行冻结 OCR 和冻结计划，模型调用为零。

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| n210 虚线 | 15 个普通分量和一个端头；共同 RGB 中位数为 `[162,189,179]`，其中一段 `[185,204,219]` 的最大通道差为 40，超过既有 38 限制 | `current-dash-rejection.json`；两个捕获快照结论相同 |
| n209 旧接纳 | 六个 dash 和一个端头；端头的完整几何可成立，但完整颜色覆盖观察失败，不能只凭外包框发出箭头 | `n209-analysis.json`、`n209-head-analysis.json` |
| 完整 raw 回放 | **4/11**，29 图像对象；撤销 `scene-relation-n209`，其余原生形状和文本严格相等 | `real-delta.json`；`raw-after.log`，约 65.28 秒 |
| 独立捕获回放 | 同为 **4/11**；含诊断钩子，约 104.91 秒，不作为性能基线 | `raw-capture-after.log`、`captured-current-dashes.json` |
| 其他资产 | 图像身份和位置不变；28 个图像资产字节相同，全页 residual 及相应所有权指标重新计算 | `real-delta.json` |
| 真实 OpenXML | 846,473 字节，未发出未获源证明的 n209 原生关系 | `real-openxml.json` |
| PowerPoint 整页渲染 | PDR **8.0016381266%**；Missing **2.0352064979%**；MAD **8.3573581838** | `office-visual.json`、`office-after-v1/` |

实际 raw 输出为 `.codex-temp/source-regional-branch-20261021-v1/raw-replay-dash-v1/compiled/`，其中 `deck.json` 和 `actual-raw-partial.pptx` 为本轮产物；上一级 `scope.json` 记录实际语义与组件结果。这是本地冻结回放，不是共享 Worker、新 OCR/VLM 或生产验收。

`n209-source-crop.png` 与 `n209-render-crop.png` 保留了实际差异。全页 residual 的 237 个捕获墨迹位置在前后均非不透明，局部图像和原生层还参与最终合成；不能将单张 residual 的透明度统计解释为整条线已完整保留或已经丢失。最终渲染仍有局部差异，不宣称 n209 的视觉或可编辑性已经修好。

## 回归与工程验证

- 新增 [source-visible-dash-profile.test.js](../test/source-visible-dash-profile.test.js) 及 [source-directed-dashes.cjs](../test/helpers/source-directed-dashes.cjs)，覆盖横/纵轴、端点反向、完整端头及间隔、两列短 dash、未测量片段、矩形/反向/异色/非一致颜色端头、侧枝、空图、单段、断裂、透明、遮挡、预算耗尽和生产阶段不发出墨迹归属。私有源缓冲与计划保持不变。
- 修复前回归 **2 通过、2 失败**，证明旧实现错误接纳短片段和矩形端头；失败日志保留在 `dash-regression-before.tap`。最终扩展回归 **6/6**，见 `dash-final-v2.tap`。
- 统一 unit 发现器选择 **201 个文件，1512/1512** 通过、零跳过，包含上述最终六项测试；见 `source-test-files.json`、`source-suite-final.tap`。它与单独聚焦测试重叠，不相加。
- [OpenXML 契约](../test/openxml-native-line-dash-contract.test.js) **3/3** 通过、零跳过；新增项实际构建四种方向/坐标组合，检查每个 custom dash 间隔、完整端头、原生箭头和真实连接锚点。unit/contract 发现器均已确认收录。
- 两组 TypeScript、Lint、2215 文件架构预算、1222 文件/20 包边界通过，七项既有 decreasing-only 例外未增加。未执行全仓单次 `verify:ci`。
- 干净安装包首次在安装阶段触发原有五分钟超时；原失败日志保留在 `package-after.log`。随后使用缓存离线模式与同一时限重跑通过：3,805,829 字节、1817 文件、20 包；实际 Worker/program/shared-route 消费及生产依赖闭包检查通过。见 `package-offline-after.log`，没有扩大超时或跳过检查。

旧轮交付清单中的七个文件指纹重新核对未变；已有迁移、dirty 状态和历史失败证据继续保留。本轮未提交、推送、部署或激活共享运行时。

## 继续工作的边界

n209、n210 需要在完整原始墨迹上建立可编译的颜色和端头证明，不能放宽颜色误差、删除困难样本或凭外包框授权擦除。下层 n204..n208 的唯一关系路径仍未完成，n206/n207 的双观察预算已经用完；不能自动追加同一实验的模型观察。闭合填充关系的语义边界、其余原生对象、整页组件/语义/视觉门禁以及实际 Worker 和编辑验收仍待解决。

前序足迹修复及已知限制见 [native-footprint 记录](image-to-editable-native-footprint-20261021.md)。
