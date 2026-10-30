# 图片转可编辑 PPT：完整余轴的独立背景与切向校准

本轮真实冻结输入的完整 raw 重建从 **4/11 提升至 5/11** 条关系：新增跨区 `relation-regional-0-0`，输出一条原生开放圆角路径。实际 PowerPoint 渲染的整页 PDR 从 **8.0039910259% 变为 8.0506674603%**，视觉指标退步且仍超过 8%；组件、严格语义和原生路径语义门禁也仍失败。目标未完成，不能据此发布或声称整页验收通过。

## 修复与边界

原复合箭头的完整余轴校准仅使用全局底色和前方两个源格点的切向。在背景横带、渐变和数字台阶处，横截面可能找不到两格真实背景；独立的完整头部及源路径证明因此无法继续组合。

- [source-route-scanline-background.js](../packages/slideclone-core/routing/source-route-scanline-background.js) 按需验证完整行、列：两侧各两个不透明像素拟合空间线性背景，整行或整列的所有原像素须达到原有 90% / 18 通道容差。两方向冲突时返回原全局背景，不平均或拼接冲突证据。此模块不读取提案、端点掩码或中心线颜色，不授予墨迹、端口、拓扑或擦除权限。
- [source-compound-route-width.js](../packages/slideclone-core/routing/source-compound-route-width.js) 保留原完整校准的成功快路径。失败后逐个检查全部余轴内部采样，允许使用上述独立背景，以及经原 .75px 简化误差再次验证的直线段切向。余轴必须是原始路径中的连续、同序、未改写区段；不能删除困难样本。
- [source-compound-route-partition.js](../packages/slideclone-core/routing/source-compound-route-partition.js) 接入该校准。完整头部、原始连通分量、头轴并集、全墨迹覆盖、背景侧翼、颜色、私有端口和唯一关系身份仍各自证明。
- 新模块加入严格边界类型检查和安装包必需文件；新增回归通过正式 unit 发现器进入统一 CI。

保留 1..5px 宽度、12px 扫描、两侧各两格真实背景、240 alpha、18 通道误差、90% 支持、512 源样本、16 顶点和四百万共享几何账本。没有增加依赖、放宽门禁或提高预算。

## 真实输入与证据

证据目录：`.codex-temp/source-route-normal-frame-20261021-v1/`。源图 SHA256 为 `a6f77ffb75653f04a4ca47d43e9f692b838b3ea43eb15a53b91304c98d81d1b3`；计划继续使用 `.codex-temp/source-contact-audit-20261021-v1/real-oKeW6y/final-plan.json`。输入为原图、68 行冻结 OCR 和冻结计划，模型调用为零。

| 范围 | 当前结果 | 证据 |
| --- | --- | --- |
| 原候选掩码的独立前后对照 | 旧分区失败；当前分区及完整折线证明通过，无额外端点补点；支持率 98.097826%，拟合轴宽 4.824555px；220,297 → 592,611 几何检查 | `baseline-differential.json` |
| 完整实际 raw 回放 | **5/11**，29 图像对象；n201、n209 的既有关系对象严格相等；新增跨区关系仅一个原生对象 | `real-delta.json`；raw 结果在下述目录 |
| 完整源网络保留 | 下层仍为 12 边、1 闭环，全部源样本、接触点、宽度及 3,418,699 次工作严格相等 | `physical-preservation.json` |
| 实际整页 OpenXML | 新关系为单条开放 cubic 路径，原生箭头；完整 PPTX 847,455 字节 | `real-openxml.json` |
| 本机 PowerPoint 渲染 | PDR **8.0506674603%**；Missing 2.0535583437%；MAD 8.3974954659；PDR 未通过 | `office-visual.json`、`office-after-v1/diff/pixel-diff.iteration-0.json` |
| 新关系原生节点编辑、另存、重开 | 副本节点 10 → 10；首节点 x 增加 1.000732pt，y 不变 | `office-edit.json` |

实际 raw 输出目录为 `.codex-temp/source-regional-branch-20261021-v1/raw-replay-normal-frame-v1/`，其中 `scope.json` 和 `compiled/deck.json` 是最终回放依据。空白页编译仍为 3/11，不能替代实际 OCR 环境的 5/11。节点编辑检查只覆盖新关系的一个独立副本，不代表整页拖动、自动重路由或线上 Worker 验收。

先前的 97.25% 是隔离组合实验，曾额外保留四个端点像素，不具备生产证明权限。本轮重新用原掩码和正式实现复测；完整 raw 路径没有加入这些像素。额外端点版本在当前组合下反而失败，记录保留在 `composition-after.json`，不能混用两个候选的数字或权限。

## 验证

- 统一 unit 发现器选出的 50 个路由、共享网络及实际消费测试文件，**297/297** 通过、零跳过；见 `route-suite-final.tap`。后续补充精确阈值和完整组合回归，最终三个修改测试文件 **17/17** 通过、零跳过；见 `focused-final.tap`。两组有重叠，不相加为总测试数。
- 实际 OpenXML 和 Worker/program 消费契约 **11/11** 通过、零跳过；见 `contracts-final.tap`。
- 两组 TypeScript 通过；Lint、2214 文件架构预算、1222 文件/20 包边界通过，七项既有 decreasing-only 例外未增加。见 `typecheck-final.log`、`lint-first.log`。没有声称运行全仓单次 `verify:ci`。
- 离线干净安装与实际 Worker 消费通过：3,800,764 字节、1815 文件、20 包，生产依赖闭包通过。见 `package-final.log`。归档覆盖最终生产代码；本文在该验证之后新增。
- 回归覆盖完整行列、真实头轴组合、宽笔画、空白、断裂/分支、透明、截断、冲突证据、精确 90% / 18 边界、源顺序、缓存、极端/非法/代理/访问器输入和预算耗尽。源缓冲、掩码和原路径保留不变。初期失败夹具及修正原因保留于各 TAP 日志，未通过改变规则或跳过测试制造通过。

最终文件、输入与证据指纹，以及原 dirty 工作区保留检查见同目录 `delivery-manifest.json`。未提交、推送、重启、部署或激活共享运行时。

## 剩余工作

新增关系的源证明通过，但渲染后的视觉误差上升，需要继续检查完整源足迹与最终描边、端头和圆角表示的对应关系，不能靠四舍五入、手调单页参数或修改 PDR 阈值放行。

下层 n204..n208 仍需唯一且有源依据的关系身份；n206/n207 的双观察预算已用完，不能自动重试模型或代填已知源边。n210 当前实际 raw 拒绝码仍为 `shaft-support`。其余原生对象、整页组件/语义/视觉门禁、完整编辑保存重开和实际 Worker 验收尚未完成。此前背景、箭头和端点调查见[箭头截面记录](image-to-editable-arrow-slab-20261021.md)，视觉基线见[空间渐变记录](image-to-editable-spatial-gradient-20261021.md)。
